/**
 * Peer 储备合并工具 —— Phase 3
 *
 * 职责：
 *   把 Phase 2 `resolvePeerReserve` 产出的 `ResolvedPeerPackage[]` 合并进
 *   `processAll` 的 packages 数组，并提供配套的纯函数：
 *     1) 开关解析（includePeerReserve 宽松布尔解析）
 *     2) existingSpecs 构造（lockfile 已有包的去重集合）
 *     3) ResolvedPeerPackage → PackageInfo 转换（scope/name 拆分 + tarball 透传）
 *     4) 合并（不可变，不 mutate 入参 packages）
 *     5) racePeerReserveWithTimeout —— controller 层强制超时（Promise.race）
 *
 * 设计原则：
 *   - 全部为纯函数，无副作用，便于单测覆盖；
 *   - 严格 TS、零隐式 any；
 *   - immutability：始终构造新数组/新对象，绝不修改入参。
 *
 * 这些函数被 `lockfileController.processAll` 调用，
 * 将原本耦合在 controller 内的转换/合并逻辑抽离，提升可测性与可读性。
 */

import {
  parsePackage,
  type PackageInfo,
  type PeerReserveCandidate,
} from "@npm-downloader/core";
import type {
  ResolvePeerReserveOptions,
  ResolvePeerReserveResult,
  ResolvedPeerPackage,
} from "../services/peerReserveService.js";

/**
 * 宽松解析 includePeerReserve 开关。
 *
 * 接受的“真”值：true / "true"（大小写不敏感） / "1"。
 * 其余（false / "false" / "0" / undefined / 任意字符串）一律视为 false。
 *
 * 与现有 `blockCritical`（`!== "false" && !== "0"`）的宽松解析风格保持一致：
 * 即便前端通过 multipart/form-data 传字符串，也能正确识别。
 *
 * @param raw 来自 req.body 的原始值（类型不确定，故用 unknown）
 * @returns 解析后的布尔值，默认 false
 */
export function parseIncludePeerReserveFlag(raw: unknown): boolean {
  if (typeof raw === "boolean") {
    return raw;
  }
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    return normalized === "true" || normalized === "1";
  }
  // number 1 视为 true，其他 number 视为 false（防御性，multipart 一般是字符串）
  if (typeof raw === "number") {
    return raw === 1;
  }
  return false;
}

/**
 * 根据 packages 数组构造 existingSpecs 集合。
 *
 * spec 口径：`${全名}@${version}`，其中全名 = scope ? `${scope}/${name}` : name。
 * 这与 peerReserveService 内部的 `buildSpec` 完全一致，
 * 从而保证 service 内 visited 的初始去重口径与 lockfile packages 严格对齐。
 *
 * 不可变：基于入参 packages 只读创建新 Set，绝不修改入参数组或其元素。
 *
 * @param packages lockfile 解析出的 packages（只读）
 * @returns 新建的 Set<`${全名}@${version}`>
 */
export function buildExistingSpecs(
  packages: ReadonlyArray<PackageInfo>
): Set<string> {
  return new Set(
    packages.map((pkg) => {
      const fullName = pkg.scope ? `${pkg.scope}/${pkg.name}` : pkg.name;
      return `${fullName}@${pkg.version}`;
    })
  );
}

/**
 * 将单个 ResolvedPeerPackage 转换为 PackageInfo。
 *
 * 转换要点：
 *   - rp.name 是“含 scope 的全名”（如 `@types/node`），需要拆分为 scope + name
 *     以匹配 PackageInfo 的字段约定（scope 可选、name 不含 scope）；
 *   - 复用 core 的 `parsePackage(`${rp.name}@${rp.version}`)` 拿到 scope/name/version，
 *     与 lockfile 解析口径完全一致（single source of truth）；
 *   - 附加 tarball = rp.tarball，保证下载侧 `resolvePackageUrl` 优先用真实地址；
 *   - 失败保护：parsePackage 返回 null 时（理论上不会发生，rp.name/version 必然合法），
 *     抛出明确错误，避免静默丢包。
 *
 * 不可变：始终构造新对象，不修改入参 rp。
 *
 * @param rp service 解析出的单个 peer 储备包
 * @returns 等价的 PackageInfo（含 tarball）
 * @throws 当 parsePackage 无法解析 `${rp.name}@${rp.version}` 时抛出（防御性）
 */
export function resolvedPeerToPackageInfo(rp: ResolvedPeerPackage): PackageInfo {
  const spec = `${rp.name}@${rp.version}`;
  const parsed = parsePackage(spec);
  if (!parsed) {
    // 理论不可达：service 的 rp.name/version 来自 pacote.manifest，必然合法。
    // 但为了严格类型与不静默丢包，这里显式抛出。
    throw new Error(`无法解析 peer 储备包 spec: ${spec}`);
  }
  // 不可变构造：基于 parsed（已含 scope?/name/version）附加 tarball 字段
  return {
    ...parsed,
    tarball: rp.tarball,
  };
}

/**
 * 把 ResolvedPeerPackage[] 批量转换为 PackageInfo[]。
 *
 * 仅是 `resolvedPeerToPackageInfo` 的 map 包装，保留为一个独立导出函数：
 *   - 调用方语义更清晰（直接拿到数组）；
 *   - 单测可分别覆盖“单条转换”与“批量转换”。
 *
 * 不可变：返回新数组，不修改入参。
 *
 * @param resolved service 解析出的 peer 储备包列表
 * @returns 等价的 PackageInfo 列表
 */
export function mapResolvedToPackageInfos(
  resolved: ReadonlyArray<ResolvedPeerPackage>
): PackageInfo[] {
  return resolved.map(resolvedPeerToPackageInfo);
}

/**
 * 把 peer 储备包合并进原 packages 数组。
 *
 * 合并语义：
 *   - existingSpecs 已在 service 内保证 peer 储备包不与 lockfile 重复，
 *     因此此处直接“原 packages + peerPackages”拼接即可；
 *   - 不在此处再次去重 —— 若重复，意味着 service 的 visited 失效，
 *     应在 service 侧修复，而非在此处静默吞掉（避免掩盖 bug）。
 *
 * 不可变（关键）：始终返回新数组，绝不修改入参 `basePackages`。
 *
 * @param basePackages lockfile 解析出的原始 packages（只读）
 * @param peerPackages peer 储备转换后的 packages（只读）
 * @returns 合并后的新 packages 数组
 */
export function mergePeerReservePackages(
  basePackages: ReadonlyArray<PackageInfo>,
  peerPackages: ReadonlyArray<PackageInfo>
): PackageInfo[] {
  // 展开运算符构造新数组 —— 不 mutate 任一入参
  return [...basePackages, ...peerPackages];
}

// ---------------------------------------------------------------------------
// 5) controller 层强制超时（Promise.race，不依赖 pacote 是否响应 AbortSignal）
// ---------------------------------------------------------------------------

/**
 * racePeerReserveWithTimeout 内部产生的日志事件。
 *
 * 设计：本纯函数不直接调用 addTaskLog（避免耦合 taskLogger / SSE / 文件 IO），
 *      而是把要打的日志作为事件返回，由 controller 负责落到 addTaskLog。
 *      这样该函数可以在不依赖任何全局服务的前提下被单测。
 *
 * level 与 TaskLog["level"] 对齐：info / warn / error。
 */
export interface PeerReserveLogEvent {
  level: "info" | "warn" | "error";
  message: string;
}

/**
 * racePeerReserveWithTimeout 的返回结构。
 *
 * - packages：合并后的最终 packages（超时/异常时即 [...basePackages]，放弃 peer 储备）
 * - logEvents：函数运行期间应输出的日志事件（controller 负责逐条 addTaskLog）
 * - timedOut：是否触发了外层 Promise.race 超时（便于 controller 做差异化日志）
 */
export interface RacePeerReserveResult {
  packages: PackageInfo[];
  logEvents: PeerReserveLogEvent[];
  timedOut: boolean;
}

/**
 * 注入形式的 resolvePeerReserve 签名（与 service 导出的函数同构）。
 *
 * 用注入而非直接 import 的目的：
 *   1) 可测性 —— 单测可注入“永不 resolve”的 mock，验证超时强制生效；
 *   2) 解耦 —— 本函数不持有对 peerReserveService 的运行时依赖，便于在工具层独立演进。
 */
export type ResolvePeerReserveFn = (
  candidates: PeerReserveCandidate[],
  options: ResolvePeerReserveOptions
) => Promise<ResolvePeerReserveResult>;

/**
 * controller 层 peer 储备解析的强制超时包装。
 *
 * 背景（为何不依赖 AbortController+signal）：
 *   service 内部 `await Promise.all(rootTasks)` 与 `await Promise.all(childTasks)`
 *   要求**所有** pacote.manifest 都 settle 才会让 resolvePeerReserve 返回。
 *   实测 pacote@21 的 manifest 在收到 AbortSignal 时**不会**及时 reject/中止请求，
 *   进行中的 manifest 持续挂起 → Promise.all 永不 resolve → resolvePeerReserve 永不返回
 *   → 上层 await 永久挂起。即 controller 仅靠 controller.abort() 无法让流程继续。
 *
 * 本函数的解法：
 *   在 controller 层用 `Promise.race([resolvePeerReserve(...), 本地 setTimeout timeoutPromise])`。
 *   Node 事件循环保证 setTimeout 到点必然触发，timeoutPromise 必然 resolve，
 *   **完全不依赖 pacote 是否响应 AbortSignal**。超时赢得 race 时，放弃 peer 储备、
 *   返回 [...basePackages]，主流程继续走向 audit。
 *
 * 失败隔离：
 *   - resolvePeerReserve 抛错（理论不应发生，service 已做失败隔离）→ 降级 [...basePackages]；
 *   - 超时 → 降级 [...basePackages]；
 *   - 正常 → mapResolvedToPackageInfos + mergePeerReservePackages 不可变合并。
 *
 * immutability：永不修改入参 basePackages，始终返回新数组。
 *
 * @param params              参数对象
 * @param params.resolvePeerReserve 注入的 service 函数（或其 mock）
 * @param params.candidates   Phase 1 产出的 peer 储备候选
 * @param params.basePackages lockfile 解析出的原始 packages（只读）
 * @param params.existingSpecs lockfile 已有包的去重集合
 * @param params.timeoutMs    超时毫秒（controller 默认 90000，单测可注入 100）
 * @param params.signal       AbortSignal（可选，尽力停止内部请求释放资源，**不依赖**）
 * @returns 合并后 packages + 日志事件 + 是否超时
 */
export async function racePeerReserveWithTimeout(params: {
  resolvePeerReserve: ResolvePeerReserveFn;
  candidates: ReadonlyArray<PeerReserveCandidate>;
  basePackages: ReadonlyArray<PackageInfo>;
  existingSpecs: Set<string>;
  timeoutMs: number;
  signal?: AbortSignal;
  onProgress?: (msg: string) => void;
}): Promise<RacePeerReserveResult> {
  const {
    resolvePeerReserve,
    candidates,
    basePackages,
    existingSpecs,
    timeoutMs,
    signal,
    onProgress,
  } = params;

  const logEvents: PeerReserveLogEvent[] = [];

  // —— 本地 timeoutPromise（关键：Node 事件循环保证 setTimeout 必然触发）——
  // 用一个显式的 timer id 句柄，正常/超时/异常路径都要 clearTimeout，防泄漏。
  // 注意：这里**只**用 setTimeout 触发 resolve，不做任何外部 IO，
  //       因此无论 pacote 是否响应 signal，到点 race 必然有结果。
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<{ timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
  });

  // race 的判别联合类型：service 正常结果 | 超时标记
  type RaceResult = ResolvePeerReserveResult | { timedOut: true };

  let raceResult: RaceResult;
  try {
    raceResult = await Promise.race([
      resolvePeerReserve([...candidates], {
        existingSpecs,
        concurrency: 8,
        onProgress: onProgress ?? (() => {}),
        signal,
      }),
      timeoutPromise,
    ]);
  } catch (error) {
    // 防御性：service 内部已做失败隔离，正常不会抛；走到这里说明出现未预期异常。
    // 降级为“跳过 peer 储备”，绝不让主流程中断。
    clearTimeout(timer);
    const errMsg = error instanceof Error ? error.message : String(error);
    logEvents.push({
      level: "warn",
      message: `peer 储备解析异常，已跳过 peer 储备并继续主流程：${errMsg}`,
    });
    return { packages: [...basePackages], logEvents, timedOut: false };
  }

  // clearTimeout 防泄漏：无论 race 谁赢，timer 都不再需要。
  // 必须放在 try/catch 之外、判定之前，确保所有正常分支都清理。
  clearTimeout(timer);

  // —— 判定：超时赢得 race → 放弃 peer 储备，主流程继续 ——
  if ("timedOut" in raceResult && raceResult.timedOut) {
    logEvents.push({
      level: "warn",
      message: `peer 储备解析超时(${timeoutMs / 1000}s)，已放弃 peer 储备，继续主流程`,
    });
    return { packages: [...basePackages], logEvents, timedOut: true };
  }

  // —— 正常分支：service 返回了 packages + skipped ——
  const resolved = raceResult as ResolvePeerReserveResult;
  const peerPackages = mapResolvedToPackageInfos(resolved.packages);
  const merged = mergePeerReservePackages(basePackages, peerPackages);

  const skippedSuffix =
    resolved.skipped.length > 0 ? `，${resolved.skipped.length} 个解析失败` : "";
  logEvents.push({
    level: "info",
    message: `peer 储备：新增 ${peerPackages.length} 个包${skippedSuffix}`,
  });

  // 失败条目逐条 warn（candidate + range + error），便于用户定位
  for (const item of resolved.skipped) {
    logEvents.push({
      level: "warn",
      message: `peer 储备解析失败：${item.candidate}@${item.range} - ${item.error}`,
    });
  }

  return { packages: merged, logEvents, timedOut: false };
}
