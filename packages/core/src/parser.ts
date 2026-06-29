import { readWantedLockfile } from "@pnpm/lockfile-file";
import type {
  PackageInfo,
  PeerReserveCandidate,
  SkippedDep,
  LockfileParseResult,
} from "./types.js";
import { ensureLockFile } from "./utils.js";
import { logger } from "./logger.js";
const pattern: RegExp =
  /^(@[^/]+\/[^@]+|[^@]+)@(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?)/;

/**
 * 根据 lockfile key 推断被跳过的原因
 */
const inferSkipReason = (raw: string): SkippedDep["reason"] => {
  if (raw.includes("link:") || raw.startsWith("link:")) return "link";
  if (raw.includes("file:") || raw.startsWith("file:")) return "file";
  if (raw.includes("workspace:") || raw.startsWith("workspace:")) return "workspace";
  if (raw.startsWith("git+") || raw.startsWith("github:") || raw.includes("://github.com")) return "git";
  if (raw.startsWith("npm:") || raw.includes("::")) return "alias";
  if (raw.startsWith("catalog:")) return "catalog";
  return "unknown";
};

/**
 * packages 段的类型别名：key 为标准 spec，value 含可选 resolution.tarball，
 * 以及 peerDependencies / peerDependenciesMeta（Phase 1 Peer 储备候选来源）。
 * 仅在本模块内部使用，便于 findPrefixedTarball / getPackageMeta 的入参表达。
 */
type PackagesSegment = Record<
  string,
  | {
      resolution?: { tarball?: string };
      peerDependencies?: Record<string, string>;
      /** 形如 { '@types/node': { optional: true } } */
      peerDependenciesMeta?: Record<string, { optional?: boolean }>;
    }
  | undefined
>;

/**
 * 读取 packages 段中某个包的元信息（resolution / peerDependencies / peerDependenciesMeta）。
 *
 * 查找策略（双层）：
 * 1) 精确命中 packages[resolutionKey]；
 * 2) patchedDependencies 场景下，回退到 `${resolutionKey}(` 前缀的补丁条目。
 *
 * 背景：当项目声明 `patchedDependencies` 时，pnpm 会把补丁信息编码进
 * packages 段的 key，形如 `lodash@4.17.21(patch_hash=abc)`。
 * 而解析侧生成的 resolutionKey 是纯净的 `lodash@4.17.21`，精确查找会失配，
 * 导致 resolution / peer 声明取不到（tarball 会静默降级回官方 registry 硬拼）。
 * 约定 pnpm 的补丁后缀总是紧跟在 version 后以 `(` 起始，
 * 因此 `${prefix}(` 这一前缀不会误伤 `lodash@4.17.21-beta` 等其他条目。
 *
 * tarball 读取与 peer 声明收集都走此函数，保证 key 解析口径完全一致（single source of truth）。
 *
 * @param packages pnpm-lock.yaml 的 packages 段
 * @param resolutionKey 纯净 spec，如 `lodash@4.17.21` 或 `@scope/pkg@1.0.0`
 * @returns 命中条目的 value；未命中返回 undefined
 */
const getPackageMeta = (
  packages: PackagesSegment | undefined,
  resolutionKey: string
): Exclude<PackagesSegment[string], undefined> | undefined => {
  if (!packages) {
    return undefined;
  }
  // 1) 精确命中
  const exact = packages[resolutionKey];
  if (exact) {
    return exact;
  }
  // 2) 补丁前缀回退：O(n) 至多扫一遍，命中即返回
  const prefix = `${resolutionKey}(`;
  for (const key of Object.keys(packages)) {
    if (key.startsWith(prefix)) {
      return packages[key];
    }
  }
  return undefined;
};

/**
 * 在 packages 段中查找带 pnpm 补丁后缀的 key 对应的 resolution.tarball。
 *
 * 实现复用 getPackageMeta（精确命中 + 补丁前缀回退），
 * 避免前缀回退逻辑在多处重复实现导致行为漂移。
 *
 * @param packages pnpm-lock.yaml 的 packages 段
 * @param resolutionKey 纯净 spec，如 `lodash@4.17.21` 或 `@scope/pkg@1.0.0`
 * @returns 命中条目的 tarball；未命中返回 undefined
 */
const findPrefixedTarball = (
  packages: PackagesSegment | undefined,
  resolutionKey: string
): string | undefined => {
  return getPackageMeta(packages, resolutionKey)?.resolution?.tarball;
};

export const parsePackageTgzUrl = (packageInfo: PackageInfo): string => {
  const fullName = packageInfo.scope
    ? `${packageInfo.scope}/${packageInfo.name}`
    : packageInfo.name;
  const urlPackageName = packageInfo.scope
    ? packageInfo.name
    : packageInfo.name;
  return `https://registry.npmjs.org/${fullName}/-/${urlPackageName}-${packageInfo.version}.tgz`;
};

/**
 * 解析包的真实下载 URL。
 *
 * 优先使用 pnpm-lock.yaml 中已解析出的 `resolution.tarball`（镜像源/私有源场景）；
 * 当该字段缺失时，回退到 `parsePackageTgzUrl` 的硬拼结果（官方 registry）。
 *
 * 这样做的好处：上传的 lockfile 已经记录了用户当前镜像源的真实地址，
 * 直接复用可以避免拼出错误的源导致下错包或 404。
 */
export const resolvePackageUrl = (pkg: PackageInfo): string => {
  return pkg.tarball ?? parsePackageTgzUrl(pkg);
};

export const parsePackage = (packageStr: string): PackageInfo | null => {
  if (!packageStr) {
    return null;
  }
  const match = packageStr.match(pattern);
  if (match) {
    const fullName = match[1];
    const version = match[2];
    if (!fullName || !version) {
      return null;
    }
    if (fullName.startsWith("@")) {
      const scopeMatch = fullName.match(/^(@[^/]+)\/(.+)$/);
      if (scopeMatch) {
        const scope = scopeMatch[1];
        const name = scopeMatch[2];
        if (!scope || !name) {
          return null;
        }
        logger.info(`Scope: ${scope}, Package: ${name}, Version: ${version}`);
        return { scope, name, version };
      }
    }
    logger.info(`Package: ${fullName}, Version: ${version}`);
    return { name: fullName, version };
  }
  return null;
};

export const parseLockFile = async (
  lockfilePath?: string
): Promise<LockfileParseResult | undefined> => {
  try {
    const { dir, file } = ensureLockFile(lockfilePath);
    logger.info(`Using lockfile: ${file}`);
    const lockfile = await readWantedLockfile(dir, {
      ignoreIncompatible: false,
    });
    if (!lockfile) {
      return undefined;
    }

    // 扩展类型断言：安全访问 packages[key].resolution.tarball、
    // peerDependencies / peerDependenciesMeta 与 snapshots 段。
    // 注意：resolution / peerDependencies 只存在于 packages 段，snapshots 段没有，
    // 因此这些字段必须用 packages 段的原始 key 读取，不能用 snapshots 段的 key
    // （snapshots 的 key 可能带 peer 后缀，如 "main@1.0.0(peer-a@2.0.0)"）。
    const resolvedLockfile = lockfile as typeof lockfile & {
      snapshots?: Record<string, unknown>;
      packages?: PackagesSegment;
    };
    const packageEntries = Object.keys(resolvedLockfile.packages || {});
    const snapshotEntries = Object.keys(resolvedLockfile.snapshots || {});
    const entries = Array.from(new Set([...packageEntries, ...snapshotEntries]));
    const packages: PackageInfo[] = [];
    const skipped: SkippedDep[] = [];
    const seenPackages = new Set<string>();

    /**
     * Peer 储备候选聚合表（Phase 1）。
     *
     * key = peer 全名（含 scope）；value 用 Set 聚合 ranges / declaredBy 以天然去重，
     * optional 用或运算合并（任一声明方标记 optional 即视为 optional）。
     * 循环结束后再一次性“冻结”成不可变数组对象。
     */
    const peerMap = new Map<
      string,
      {
        ranges: Set<string>;
        declaredBy: Set<string>;
        optional: boolean;
      }
    >();

    for (const raw of entries) {
      const parsed = parsePackage(raw);
      if (parsed) {
        const key = parsed.scope
          ? `${parsed.scope}/${parsed.name}@${parsed.version}`
          : `${parsed.name}@${parsed.version}`;
        if (!seenPackages.has(key)) {
          // resolution 的查找 key 必须是 packages 段的标准 spec
          // （scope/name@version），与 pnpm-lock.yaml 中 packages 段的 key 形式一致，
          // 而非 raw（raw 可能来自 snapshots 段，带 peer 后缀）。
          const resolutionKey = key;
          // resolution / peerDependencies 等元信息统一通过 getPackageMeta 读取，
          // 复用与 tarball 完全一致的“精确命中 + 补丁前缀回退”策略，
          // 避免 patched 包（key 带 (patch_hash=...) 后缀）取不到 peer 声明。
          const meta = getPackageMeta(resolvedLockfile.packages, resolutionKey);
          // tarball 查找保留原有两步语义，避免对历史行为产生任何回归：
          //   1) 精确命中 packages[resolutionKey]?.resolution?.tarball；
          //   2) 精确 key 无 tarball 时，再用前缀回退（findPrefixedTarball）兜底。
          // （仅在“精确 key 存在但无 tarball、补丁条目却带 tarball”这一极少见场景下
          //   与单次 getPackageMeta 有差异；保留两步以严格不破坏现有行为。）
          const exactHit =
            resolvedLockfile.packages?.[resolutionKey]?.resolution?.tarball;
          const tarball =
            exactHit ?? findPrefixedTarball(resolvedLockfile.packages, resolutionKey);
          // 不可变：始终构造新对象，命中 tarball 时附加该字段，否则保持原样（fallback 交给消费侧）
          const enriched: PackageInfo = tarball
            ? { ...parsed, tarball }
            : parsed;
          packages.push(enriched);
          seenPackages.add(key);

          // —— Phase 1：收集 peer 声明候选（纯本地，不联网）——
          // peerDependencies 形如 { '@types/node': '>=18', sass: '*' }；
          // peerDependenciesMeta 形如 { '@types/node': { optional: true } }。
          const peerDeps = meta?.peerDependencies;
          const peerMeta = meta?.peerDependenciesMeta;
          if (peerDeps) {
            for (const [peerName, range] of Object.entries(peerDeps)) {
              // 用 get-or-create 取出/创建聚合桶（不可变：不修改入参 lockfile）
              let bucket = peerMap.get(peerName);
              if (!bucket) {
                bucket = { ranges: new Set<string>(), declaredBy: new Set<string>(), optional: false };
                peerMap.set(peerName, bucket);
              }
              // ranges 去重（A2 策略=全收集，不合并）
              bucket.ranges.add(range);
              // declaredBy 记录声明方的完整 spec（scope/name@version 或 name@version）
              bucket.declaredBy.add(key);
              // optional：任一声明方在 peerDependenciesMeta 标记 optional 即置 true
              if (peerMeta?.[peerName]?.optional === true) {
                bucket.optional = true;
              }
            }
          }
        }
      } else {
        skipped.push({ raw, reason: inferSkipReason(raw) });
      }
    }

    if (skipped.length > 0) {
      logger.info(
        `Skipped ${skipped.length} non-registry entries: ${skipped.map((s) => s.reason).join(", ")}`
      );
    }

    // 基于 packages 数组构建“已安装包全名”集合，用于判定每个 peer 是否已存在。
    // 全名约定：scope/name（去前导斜杠后的包名部分），与 peer 声明的 key 形式一致。
    // 例如 @types/node@18.19.130 -> '@types/node'；lodash@4.17.21 -> 'lodash'。
    const installedNames = new Set<string>(
      packages.map((p) =>
        p.scope ? `${p.scope}/${p.name}` : p.name
      )
    );

    // 将聚合桶“冻结”成不可变候选数组（Set -> Array），并填充 installed 标志。
    // 不可变：始终构造新对象，不 mutate 入参 lockfile 或聚合桶本身。
    const peerReserveCandidates: PeerReserveCandidate[] = Array.from(
      peerMap.entries()
    ).map(([name, bucket]) => ({
      name,
      ranges: Array.from(bucket.ranges),
      declaredBy: Array.from(bucket.declaredBy),
      optional: bucket.optional,
      installed: installedNames.has(name),
    }));

    if (peerReserveCandidates.length > 0) {
      logger.info(
        `Collected ${peerReserveCandidates.length} peer reserve candidate(s)`
      );
    }

    return {
      packages,
      totalEntries: entries.length,
      skipped,
      peerReserveCandidates,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error({ err }, "Error reading lockfile");
    return undefined;
  }
};
