/**
 * Peer 储备 Service —— Phase 2：联网 pacote 递归解析
 *
 * 职责：
 *   接收 Phase 1 产出的 peerReserveCandidates，对其中 **未安装（installed=false）**
 *   的候选，按 range 调用 pacote.manifest 解析出“该 range 内最新满足版”，
 *   并递归其 dependencies（B2 策略：完整依赖树），最终给出：
 *     - packages：所有需要补下的包（根 peer + 传递依赖），含 tarball 与来源 via
 *     - skipped：解析失败的 candidate+range+error（失败隔离，不中断整体）
 *
 * 本阶段只实现 service + 单测，**不集成 controller、不真联网**。
 *
 * 关键设计要点：
 *   1) immutability —— 绝不 mutate 入参 candidates / existingSpecs；
 *      visited 集合是 options.existingSpecs 的 **副本**。
 *   2) 全局去重 visited —— 初始含 lockfile packages 全集（name@version），
 *      递归过程中累加，防环、防 peer 树内部重复、防与 lockfile 重复。
 *   3) 同 name 多 range —— 每个 range 独立解析（range 内最新满足版），
 *      即便最终解析到同一 version，也由 visited 自然去重（只收一次）。
 *   4) 失败隔离 —— 任意 manifest reject 仅记录到 skipped，不影响其他候选/依赖。
 *   5) 并发控制 —— p-limit，默认 8，所有 manifest 调用都经 limit 包装。
 */

import pacote from "pacote";
import pLimit from "p-limit";
import type { PeerReserveCandidate } from "@npm-downloader/core";

/**
 * pacote.manifest 返回结果的最小子集。
 *
 * 说明：server 的 devDependencies 里有 `@types/pacote@11.1.8`（针对 pacote v11），
 * 而运行时是 pacote@21。两版的 manifest 形状在我们要用的字段上完全一致
 * （name / version / dependencies / dist.tarball / optionalDependencies）。
 * 为了不受 @types/pacote 版本漂移影响、保证严格 TS 且零隐式 any，
 * 这里声明一个本地最小接口，对 pacote.manifest 的返回值做类型断言。
 */
interface ManifestLike {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  /**
   * 可扩展点：未来若需要递归 optionalDependencies，可启用此字段。
   * 当前 Phase 2 **故意不递归** optionalDependencies，避免平台特定二进制
   * （如 esbuild、@swc/* 的平台包）扩散导致体积爆炸。
   */
  optionalDependencies?: Record<string, string>;
  dist: {
    tarball: string;
  };
}

/** 解析成功的单个包（不可变结构） */
export interface ResolvedPeerPackage {
  /** 包全名（含 scope） */
  name: string;
  /** 解析到的具体版本（range 内最新满足版） */
  version: string;
  /** tarball 下载地址，来自 manifest.dist.tarball */
  tarball: string;
  /**
   * 引入来源（声明方 candidate 名），便于追溯。
   * 根 peer 的 via 就是 candidate.name；传递依赖的 via 是其父包的 name。
   */
  via: string;
}

/** 解析失败的条目（失败隔离记录） */
export interface PeerReserveSkipped {
  /** 失败发生的 candidate 名（根 peer 失败时即该 peer 名） */
  candidate: string;
  /** 失败的 range（传递依赖失败时是其父包给出的 range） */
  range: string;
  /** 失败原因（error.message 或 String(error)） */
  error: string;
}

/** resolvePeerReserve 的入参选项 */
export interface ResolvePeerReserveOptions {
  /**
   * 已存在的 spec 集合（name@version），递归时跳过。
   * 由调用方传入 lockfile packages 全集 —— 用于避免与 lockfile 重复、防环、防 peer 树内部重复。
   * 注意：service 内部不会 mutate 此 Set，会基于其创建副本。
   */
  existingSpecs: Set<string>;
  /** 并发数，默认 8 */
  concurrency?: number;
  /** 进度回调（可选），用于日志流式输出关键节点 */
  onProgress?: (msg: string) => void;
  /**
   * AbortSignal（可选）—— 用于整体超时/取消。
   *
   * 透传给 pacote.manifest 的第二参 `{ signal }`：
   *   - signal abort 时，进行中的 manifest 请求会以 AbortError reject；
   *   - 该 reject 被 service 现有的失败隔离机制捕获，记入 skipped（candidate/range）；
   *   - resolvePeerReserve 最终**正常返回**（已 collected 的 packages + skipped），**不抛出**。
   *
   * 设计目的：peer 储备是可选增强，绝不能阻塞主下载流程。
   * 调用方（lockfileController）持有 AbortController，到点 abort 实现整体超时降级。
   */
  signal?: AbortSignal;
}

/** resolvePeerReserve 的返回结构 */
export interface ResolvePeerReserveResult {
  /** 所有需要补下的包（根 peer + 传递依赖），顺序不保证强一致性（并发收集） */
  packages: ResolvedPeerPackage[];
  /** 解析失败条目（失败隔离） */
  skipped: PeerReserveSkipped[];
}

/**
 * 构造标准的 spec 字符串：`name@version`。
 * scope 包同样形如 `@scope/pkg@1.2.3`，与 lockfile 的 spec 口径一致。
 */
const buildSpec = (name: string, version: string): string => `${name}@${version}`;

/**
 * 解析单个 spec（name@range），返回 manifest（含 dist.tarball 与 dependencies）。
 *
 * 失败时抛出 —— 由调用方捕获并记录到 skipped（失败隔离）。
 *
 * 注意：range 可以是 `*`、`^1.2.3`、`>=18`、`1.x || 2.x` 等任意 semver 表达式，
 * pacote 内部会交给 npm 的 semver 引擎选择“range 内最新满足版”。
 *
 * @param spec   形如 `@vitest/ui@^3.0.0` 或 `lodash@4.17.21`
 * @param signal AbortSignal（可选），透传给 pacote.manifest 第二参 `{ signal }`。
 *               abort 时进行中的请求以 AbortError reject，由调用方 catch 记入 skipped。
 */
async function fetchManifest(
  spec: string,
  signal?: AbortSignal
): Promise<ManifestLike> {
  // pacote.manifest 第二参为 opts，支持 { signal }。
  // signal abort 时 pacote 会主动终止底层 HTTP 请求并以 AbortError reject。
  // pacote.manifest 返回值形状按 ManifestLike 断言（见接口注释说明原因）
  const manifest = (await pacote.manifest(spec, { signal })) as ManifestLike;
  return manifest;
}

/**
 * 解析 Peer 储备候选并递归收集依赖树。
 *
 * 流程：
 *   a) 跳过 installed=true 的候选（已在 lockfile packages，递归无意义）。
 *   b) visited = new Set(existingSpecs) —— 全局去重（含 lockfile + peer 树内部）。
 *   c) 对每个未装候选的每个 range：manifest 解析 range 内最新满足版。
 *   d) 递归 dependencies（仅 dependencies，不递归 optionalDependencies）。
 *   e) 每个命中包以不可变对象 push 到 collected；p-limit 控并发。
 *   f) 失败隔离：任何 manifest reject 记录到 skipped，不中断整体。
 *
 * @param candidates Phase 1 产出的 peer 储备候选
 * @param options    解析选项（existingSpecs 必填、concurrency 默认 8、onProgress 可选）
 */
export async function resolvePeerReserve(
  candidates: PeerReserveCandidate[],
  options: ResolvePeerReserveOptions
): Promise<ResolvePeerReserveResult> {
  const concurrency = options.concurrency ?? 8;
  const limit = pLimit(concurrency);
  const onProgress = options.onProgress ?? (() => {});
  // 整体 signal：透传给每次 pacote.manifest 调用。
  // abort 时进行中的 manifest 以 AbortError reject，被现有 .catch 记入 skipped。
  const signal = options.signal;

  // immutability：基于入参 existingSpecs 创建副本作为 visited，
  // 整个解析过程中只往副本里加，绝不修改调用方的 Set。
  const visited = new Set<string>(options.existingSpecs);

  /** 收集到的所有补下包（根 peer + 传递依赖） */
  const collected: ResolvedPeerPackage[] = [];

  /** 失败隔离记录 */
  const skipped: PeerReserveSkipped[] = [];

  onProgress(
    `peer reserve: 开始解析 ${candidates.length} 个候选（并发=${concurrency}）`
  );

  /**
   * 解析单个 spec 并（若命中新包）递归其 dependencies。
   *
   * 这是一个内部递归函数：
   *   - 命中（spec 不在 visited）→ 把 manifest 信息收集到 collected，
   *     然后 把 dependencies 排队递归。
   *   - 未命中（已在 visited）→ 直接返回，天然去重 / 防环。
   *   - manifest 解析失败 → 抛出，由调用方 catch 记录到 skipped。
   *
   * @param name    包名
   * @param range   range（可以是具体版本，也可以是 semver range）
   * @param via     引入来源（根 peer 时为 candidate.name；传递依赖时为父包 name）
   */
  const resolveOne = async (
    name: string,
    range: string,
    via: string
  ): Promise<void> => {
    const spec = `${name}@${range}`;
    onProgress(`peer reserve: resolving ${spec}`);

    const manifest = await fetchManifest(spec, signal);
    const resolvedVersion = manifest.version;
    const resolvedSpec = buildSpec(name, resolvedVersion);

    // 全局去重：lockfile 已有 / peer 树内部已收集 / 同 name 多 range 解析到同一版
    // 都会命中这里 —— 直接跳过，不再收集、也不再递归其 dependencies
    // （因为同一 version 的 dependencies 完全相同，递归只是浪费）。
    if (visited.has(resolvedSpec)) {
      onProgress(`peer reserve: 跳过已存在 ${resolvedSpec}`);
      return;
    }
    visited.add(resolvedSpec);

    // 不可变：始终构造新对象 push，不修改 manifest
    collected.push({
      name,
      version: resolvedVersion,
      tarball: manifest.dist.tarball,
      via,
    });

    // 递归 dependencies（仅 dependencies —— 见 ManifestLike.optionalDependencies 注释）
    const deps = manifest.dependencies ?? {};
    // 用 limit 包装每个子依赖的解析，控制整体并发
    const childTasks = Object.entries(deps).map(([depName, depRange]) =>
      limit(() =>
        resolveOne(depName, depRange, name).catch((error: unknown) => {
          // 传递依赖失败：记录到 skipped，candidate 字段填父包名便于追溯
          const message = error instanceof Error ? error.message : String(error);
          skipped.push({
            candidate: name,
            range: depRange,
            error: message,
          });
          onProgress(`peer reserve: 子依赖解析失败 ${depName}@${depRange} - ${message}`);
        })
      )
    );
    await Promise.all(childTasks);
  };

  // 对每个候选的每个 range 并发解析（p-limit 控并发）
  // 注意：installed=true 的候选在此处跳过 —— 它们已在 lockfile packages，
  //      Phase 1 已实测与 packages 重复，递归无意义。
  const rootTasks: Promise<void>[] = [];
  for (const candidate of candidates) {
    if (candidate.installed) {
      onProgress(`peer reserve: 跳过已安装候选 ${candidate.name}`);
      continue;
    }
    // 同 name 多 range：每个 range 独立解析（range 内最新满足版）。
    // 即便两个 range 最终解析到同一 version，visited 会自然去重（只收一次）。
    for (const range of candidate.ranges) {
      rootTasks.push(
        limit(() =>
          resolveOne(candidate.name, range, candidate.name).catch(
            (error: unknown) => {
              // 根 peer 失败：记录到 skipped，candidate 字段即该 peer 名
              const message =
                error instanceof Error ? error.message : String(error);
              skipped.push({
                candidate: candidate.name,
                range,
                error: message,
              });
              onProgress(
                `peer reserve: 根 peer 解析失败 ${candidate.name}@${range} - ${message}`
              );
            }
          )
        )
      );
    }
  }

  await Promise.all(rootTasks);

  onProgress(
    `peer reserve: 解析完成，共 ${collected.length} 个包，${skipped.length} 个跳过`
  );

  // 返回不可变结果（collected / skipped 内部已是新对象，无需二次冻结）
  return { packages: collected, skipped };
}
