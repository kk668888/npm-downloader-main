import type {
  AuditReport,
  AuditSeverity,
  PackageAuditResult,
  Vulnerability,
} from "@npm-downloader/types";
import semver from "semver";
import { addTaskLog } from "./taskLogger.js";

/**
 * 严重漏洞处理策略（通过环境变量配置，延迟读取以兼容 dotenv 加载时序）
 *
 * SKIP_CRITICAL_AUDIT=true        → 直接跳过，视为 safe（无需确认，直接下载）
 * ALLOW_CRITICAL_DOWNLOAD=true    → 降级为 risky（需用户确认后才能下载）
 * 均不设置（默认）                → blocked（禁止下载）
 */
const getCriticalPolicy = (): "skip" | "allow" | "block" => {
  if (process.env.SKIP_CRITICAL_AUDIT === "true") return "skip";
  if (process.env.ALLOW_CRITICAL_DOWNLOAD === "true") return "allow";
  return "block";
};

/** npm advisories bulk API 端点 */
const NPM_AUDIT_URL =
  "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk";

/** 总审计超时（30 秒），防止网络问题导致永久阻塞 */
const AUDIT_TIMEOUT = 30_000;

/** 空的统计摘要 */
const EMPTY_SUMMARY: Record<AuditSeverity, number> = {
  critical: 0,
  high: 0,
  moderate: 0,
  low: 0,
  info: 0,
};

/**
 * 对包列表执行安全审计
 *
 * 只调用一次 npm advisories bulk API（批量查询），不做逐包请求。
 * 网络失败时优雅降级，返回 unavailable 状态需用户确认。
 *
 * @param taskId 任务 ID，用于写日志
 * @param packages 要审计的包列表
 * @returns 审计报告
 */
export async function auditPackages(
  taskId: string,
  packages: Array<{ name: string; version: string; scope?: string }>
): Promise<AuditReport> {
  // 去重：同名同版本只审计一次
  const uniqueMap = new Map<string, { name: string; version: string }>();
  for (const pkg of packages) {
    const fullName = pkg.scope ? `${pkg.scope}/${pkg.name}` : pkg.name;
    const key = `${fullName}@${pkg.version}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, { name: fullName, version: pkg.version });
    }
  }
  const uniquePackages = Array.from(uniqueMap.values());

  addTaskLog(
    taskId,
    "info",
    `开始安全审计，共 ${uniquePackages.length} 个包...`
  );

  // 使用总超时保护，防止网络问题导致永久阻塞
  const auditResult = await Promise.race([
    runAudit(taskId, uniquePackages),
    createTimeoutFallback(taskId, uniquePackages.length),
  ]);

  return auditResult;
}

/**
 * 执行实际审计逻辑
 *
 * 成功无漏洞 → auditStatus: "safe"
 * 成功有漏洞 → auditStatus: "risky"
 * API 失败   → auditStatus: "unavailable"
 */
async function runAudit(
  taskId: string,
  packages: Array<{ name: string; version: string }>
): Promise<AuditReport> {
  // 批量查询 npm advisories API（仅一次 HTTP 请求）
  const advisories = await queryAdvisories(taskId, packages);

  // 如果 advisories 为 null 表示 API 调用失败，返回 unavailable
  if (advisories === null) {
    return {
      taskId,
      auditStatus: "unavailable",
      reason: "advisory_api_error",
      totalPackages: packages.length,
      auditedPackages: 0,
      vulnerablePackages: 0,
      results: [],
      summary: { ...EMPTY_SUMMARY },
    };
  }

  // 构建每个包的审计结果
  const results: PackageAuditResult[] = packages.map((pkg) => {
    const pkgAdvisories = advisories[pkg.name] || [];
    const vulnerabilities: Vulnerability[] = pkgAdvisories
      .filter((a: any) =>
        isVersionAffected(pkg.version, a.vulnerable_versions || "*")
      )
      .map((a: any) => ({
        title: a.title || "未知漏洞",
        severity: (a.severity || "low") as AuditSeverity,
        url: a.url || "",
        vulnerableVersions: a.vulnerable_versions || "*",
        patchedVersions: a.patched_versions,
        packageName: pkg.name,
      }));

    return {
      packageName: pkg.name,
      version: pkg.version,
      vulnerabilities,
      deprecated: false,
    };
  });

  // 统计
  const summary = { ...EMPTY_SUMMARY };
  let vulnerablePackages = 0;

  for (const result of results) {
    if (result.vulnerabilities.length > 0) {
      vulnerablePackages++;
      for (const v of result.vulnerabilities) {
        summary[v.severity]++;
      }
    }
  }

  // 根据漏洞严重程度 + 环境配置决定审计状态
  // critical + SKIP_CRITICAL_AUDIT=true       → safe（直接下载，无需确认）
  // critical + ALLOW_CRITICAL_DOWNLOAD=true   → risky（需用户确认）
  // critical + 默认                           → blocked（禁止下载）
  // 其他漏洞 → risky（需用户确认）
  // 无漏洞 → safe
  const auditStatus = summary.critical > 0
    ? (getCriticalPolicy() === "skip" ? "safe" : getCriticalPolicy() === "allow" ? "risky" : "blocked")
    : vulnerablePackages > 0
      ? "risky"
      : "safe";

  const report: AuditReport = {
    taskId,
    auditStatus,
    totalPackages: packages.length,
    auditedPackages: packages.length,
    vulnerablePackages,
    results,
    summary,
  };

  if (vulnerablePackages === 0) {
    addTaskLog(
      taskId,
      "info",
      `安全审计完成：${packages.length} 个包全部安全`
    );
  } else {
    const totalVulns = Object.values(summary).reduce((a, b) => a + b, 0);
    addTaskLog(
      taskId,
      "warn",
      `安全审计完成：发现 ${vulnerablePackages} 个包存在 ${totalVulns} 个漏洞（严重: ${summary.critical}, 高危: ${summary.high}, 中危: ${summary.moderate}, 低危: ${summary.low}）`
    );
  }

  return report;
}

/**
 * 超时保护：如果审计超过 30 秒，返回 unavailable 报告
 */
function createTimeoutFallback(
  taskId: string,
  packageCount: number
): Promise<AuditReport> {
  return new Promise((resolve) => {
    setTimeout(() => {
      addTaskLog(
        taskId,
        "warn",
        "安全审计超时（30秒），跳过审计直接下载"
      );
      resolve({
        taskId,
        auditStatus: "unavailable",
        reason: "audit_timeout",
        totalPackages: packageCount,
        auditedPackages: 0,
        vulnerablePackages: 0,
        results: [],
        summary: { ...EMPTY_SUMMARY },
      });
    }, AUDIT_TIMEOUT);
  });
}

/**
 * 调用 npm advisories bulk API 批量查询漏洞
 *
 * 一次 HTTP 请求查询所有包，不逐个查询。
 * 返回 null 表示 API 调用失败（网络错误或非 2xx 响应）。
 */
async function queryAdvisories(
  taskId: string,
  packages: Array<{ name: string; version: string }>
): Promise<Record<string, any[]> | null> {
  const body: Record<string, string[]> = {};
  for (const pkg of packages) {
    if (!body[pkg.name]) {
      body[pkg.name] = [];
    }
    if (!body[pkg.name].includes(pkg.version)) {
      body[pkg.name].push(pkg.version);
    }
  }

  addTaskLog(
    taskId,
    "info",
    `正在查询漏洞数据库（${Object.keys(body).length} 个包）...`
  );

  try {
    const response = await fetch(NPM_AUDIT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      addTaskLog(
        taskId,
        "warn",
        `漏洞数据库查询失败（HTTP ${response.status}），跳过审计`
      );
      return null;
    }

    const data = await response.json();
    return data || {};
  } catch (error) {
    addTaskLog(
      taskId,
      "warn",
      `漏洞数据库连接失败，跳过审计: ${error instanceof Error ? error.message : "未知错误"}`
    );
    return null;
  }
}

/**
 * 使用 semver 库判断版本是否在受影响范围内
 *
 * 解析失败时默认返回 true（安全优先：不确定就当作受影响）
 */
function isVersionAffected(version: string, range: string): boolean {
  if (!range || range === "*") return true;

  try {
    const coerced = semver.coerce(version);
    if (!coerced) return true;
    return semver.satisfies(coerced, range, { includePrerelease: true });
  } catch {
    return true;
  }
}
