/**
 * Represents information about an npm package.
 *
 * @property scope - (Optional) The scope of the package (e.g., "@types").
 * @property name - The name of the package.
 * @property version - The version of the package.
 * @property tarball - (Optional) 来自 pnpm-lock.yaml 中 packages 段的
 *   `resolution.tarball`，是镜像源/私有源等场景下的真实下载地址。
 *   缺失时下载侧需要回退到由 name/version 推断出的 URL（parsePackageTgzUrl）。
 */
export interface PackageInfo {
  scope?: string;
  name: string;
  version: string;
  tarball?: string;
}
export interface PackageUrlInfo extends PackageInfo {
  url: string;
}

/**
 * 被跳过的依赖项（非 registry 来源）
 */
export interface SkippedDep {
  /** lockfile 中的原始 key */
  raw: string;
  /** 推断的跳过原因 */
  reason: "workspace" | "file" | "link" | "git" | "alias" | "catalog" | "unknown";
}

/**
 * Peer 储备候选（Phase 1：纯本地收集，不联网、不下载）
 *
 * 背景：上传 lockfile 时，后续可能选择性地把 peerDependencies 声明的 peer
 * （及其依赖树）一并下载。Phase 1 仅负责“收集 peer 声明候选”，
 * 为下游决策（去重、是否补下、版本选择）提供结构化输入。
 *
 * A2 策略：全收集 —— 不做版本范围合并/取交，只把所有声明方的 range 去重后保留。
 *
 * @property name - peer 包全名（含 scope，如 `@types/node`；普通包即 name）
 * @property ranges - 所有声明该 peer 的 range 去重后的集合（如 `['>=18', '*']`）
 * @property optional - 是否在任意声明方的 peerDependenciesMeta 中被标记 optional
 * @property declaredBy - 声明它的包列表（每项为 `name@version` 或 `scope/name@version`）
 * @property installed - 该 name 是否已在 packages 段（任意版本）存在，供下游去重/决策参考
 */
export interface PeerReserveCandidate {
  /** peer 包全名（含 scope，如 @types/node；普通包即 name） */
  name: string;
  /** 所有声明该 peer 的 range 去重（如 ['>=18', '*']）。A2 策略=全收集 */
  ranges: string[];
  /** 是否在任意 peerDependenciesMeta 中被标记 optional */
  optional: boolean;
  /** 声明它的包列表（每项为 name@version 或 scope/name@version） */
  declaredBy: string[];
  /** 该 name 是否已在 packages 段（任意版本）存在 —— 供下游去重/决策参考 */
  installed: boolean;
}

/**
 * lockfile 解析结果（含统计）
 */
export interface LockfileParseResult {
  /** 成功解析的 registry 包 */
  packages: PackageInfo[];
  /** 总条目数（lockfile.packages 的 key 数量） */
  totalEntries: number;
  /** 被跳过的依赖列表 */
  skipped: SkippedDep[];
  /**
   * Peer 储备候选（Phase 1）。必填，无 peer 声明时为空数组。
   * 下游可据此决定是否补下 peer 及其依赖树。
   */
  peerReserveCandidates: PeerReserveCandidate[];
}
