/**
 * 任务类型：lockfile 或 package
 */
export type TaskType = "lockfile" | "package";

/**
 * 任务状态
 *
 * - pending    : 已创建，待处理
 * - auditing   : 安全审计中（或等待用户确认）
 * - processing : 下载 / 打包中
 * - completed  : 全部包下载成功
 * - partial    : 部分包下载成功（其余失败），ZIP 仍可用
 * - failed     : 全部包下载失败 / 任务失败
 * - cancelled  : 用户取消
 */
export type TaskStatus =
  | "pending"
  | "auditing"
  | "processing"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";

/**
 * 进度信息
 */
export interface ProgressInfo {
  current: number;
  total: number;
}

/**
 * 下载失败的单个包信息
 *
 * 用于在任务结果 / 历史记录中向前端暴露"哪些包下载失败"，
 * 以便前端提示用户"ZIP 内容可能不完整"。
 */
export interface FailedPackage {
  /** 包全名（含 scope，例如 "@types/node"），普通包就是 name */
  name: string;
  /** 包版本 */
  version: string;
  /** 失败原因（人类可读，例如 "HTTP 404"、"download timeout"、"missing after download"） */
  error: string;
}

/**
 * 历史记录项
 */
export interface HistoryItem {
  taskId: string;
  type: TaskType;
  status: TaskStatus;
  message?: string;
  createdAt: number;
  updatedAt: number;
  /** 用户自定义的文件夹名称（用于 ZIP 文件命名） */
  folderName?: string;
  zipUrl?: string;
  packageName?: string;
  packageVersion?: string;
  packagesCount?: number;
  progress?: ProgressInfo;
  /** 安全审计报告（任务审计完成后持久化） */
  auditReport?: AuditReport;
  /** 下载失败的包列表（status 为 partial / failed 时可能有值），用于前端展示失败清单 */
  failedPackages?: FailedPackage[];
}

/**
 * 任务日志
 */
export interface TaskLog {
  taskId: string;
  timestamp: number;
  level: "info" | "error" | "warn";
  message: string;
}

/**
 * 任务状态信息
 */
export interface TaskStatusInfo {
  status: TaskStatus;
  message: string;
  progress?: ProgressInfo;
  auditReport?: AuditReport;
  /** 任务令牌，用于审计确认等敏感操作的防伪造校验 */
  token?: string;
  /** 用户自定义的文件夹名称 */
  folderName?: string;
  /** 下载失败的包列表（status 为 partial / failed 时可能有值），供前端轮询任务状态时读取 */
  failedPackages?: FailedPackage[];
}

// ========================================
// 安全审计相关类型
// ========================================

/**
 * 审计状态：安全 / 有风险 / 已阻止（含严重漏洞）/ 不可用（网络超时或 API 失败）
 */
export type AuditStatus = "safe" | "risky" | "blocked" | "unavailable";

/**
 * 漏洞严重级别（与 npm audit 一致）
 */
export type AuditSeverity = "critical" | "high" | "moderate" | "low" | "info";

/**
 * 单个漏洞信息
 */
export interface Vulnerability {
  /** 漏洞标题 */
  title: string;
  /** 严重级别 */
  severity: AuditSeverity;
  /** 漏洞详情链接 */
  url: string;
  /** 受影响版本范围 */
  vulnerableVersions: string;
  /** 已修复版本 */
  patchedVersions?: string;
  /** 漏洞所属包名 */
  packageName: string;
}

/**
 * 单个包的审计结果
 */
export interface PackageAuditResult {
  /** 包名 */
  packageName: string;
  /** 版本 */
  version: string;
  /** Version normalized for semver range matching. Missing means the input was not valid semver. */
  comparedVersion?: string;
  /** 发现的漏洞列表 */
  vulnerabilities: Vulnerability[];
  /** 是否已弃用 */
  deprecated: boolean;
  /** 弃用提示信息 */
  deprecationMessage?: string;
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
 * 完整的审计报告
 */
export interface AuditReport {
  /** 关联的任务 ID */
  taskId: string;
  /** 审计状态：safe=安全 / risky=有漏洞 / blocked=含严重漏洞已阻止 / unavailable=审计不可用 */
  auditStatus: AuditStatus;
  /** 不可用时原因描述（如 audit_timeout、network_error） */
  reason?: string;
  /** 总包数 */
  totalPackages: number;
  /** 已审计包数 */
  auditedPackages: number;
  /** 存在漏洞的包数 */
  vulnerablePackages: number;
  /** 每个包的审计结果 */
  results: PackageAuditResult[];
  /** 按严重级别汇总数量 */
  summary: Record<AuditSeverity, number>;
  /** 被跳过的非 registry 依赖列表（lockfile 中无法从 npm registry 下载的条目） */
  skippedDeps?: SkippedDep[];
  /** 用户确认下载的时间戳 */
  confirmedAt?: number;
}
