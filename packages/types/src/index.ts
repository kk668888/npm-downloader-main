/**
 * 任务类型：lockfile 或 package
 */
export type TaskType = "lockfile" | "package";

/**
 * 任务状态
 */
export type TaskStatus = "pending" | "auditing" | "processing" | "completed" | "failed";

/**
 * 进度信息
 */
export interface ProgressInfo {
  current: number;
  total: number;
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
  zipUrl?: string;
  packageName?: string;
  packageVersion?: string;
  packagesCount?: number;
  progress?: ProgressInfo;
  /** 安全审计报告（任务审计完成后持久化） */
  auditReport?: AuditReport;
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
