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
 * lockfile 解析结果（含统计）
 */
export interface LockfileParseResult {
  /** 成功解析的 registry 包 */
  packages: PackageInfo[];
  /** 总条目数（lockfile.packages 的 key 数量） */
  totalEntries: number;
  /** 被跳过的依赖列表 */
  skipped: SkippedDep[];
}
