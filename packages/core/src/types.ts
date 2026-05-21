/**
 * Represents information about an npm package.
 *
 * @property scope - (Optional) The scope of the package (e.g., "@types").
 * @property name - The name of the package.
 * @property version - The version of the package.
 */
export interface PackageInfo {
  scope?: string;
  name: string;
  version: string;
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
