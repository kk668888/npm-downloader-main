import fs from "fs";
import path from "path";
import type { FailedPackage, TaskStatus } from "@npm-downloader/types";

/**
 * 下载编排的"结果校验 + 终态判定"工具。
 *
 * 目的：把 controller 中分散的"成功/失败计数 + 文件落盘校验 + 终态映射"逻辑
 * 抽成纯函数，便于单元测试，并保证 lockfileController / packageController
 * 共用同一套规则。
 *
 * 修复"ZIP 包缺失"的核心：
 *  - 除"抛错即失败"的显式失败外，再对照清单校验 taskDir 实际 .tgz 文件，
 *    抓住"未抛错但文件没生成"的静默丢失（半成品被清理、流截断等场景）。
 */

/**
 * 推断单个包的 tgz 文件名。规则与 core/buildTgzFileName 一致：
 *  - scoped（name 以 @ 开头，如 "@types/node"）→ `${scope 去掉@}-${name}-${version}.tgz`
 *    其中 name 已含 "/"，需把 "/" 也换成 "-"，结果如 types-node-20.1.0.tgz
 *  - 普通 → `${name}-${version}.tgz`
 *
 * 注意：lockfileController 传入的是拆开的 { scope, name, version }，
 * packageController 传入的是合并后的 fullName（含 scope）。
 * 这里同时支持两种入参形态以兼容两个 controller。
 *
 * @param pkg 包信息
 * @returns tgz 文件名
 */
export function buildTgzFileName(pkg: {
  scope?: string;
  name: string;
  version: string;
}): string {
  if (pkg.scope) {
    // scoped：scope 形如 "@types"，name 形如 "node"
    return `${pkg.scope.substring(1)}-${pkg.name}-${pkg.version}.tgz`;
  }
  if (pkg.name.startsWith("@")) {
    // 合并形态：name 形如 "@types/node"
    return `${pkg.name.substring(1).replace("/", "-")}-${pkg.version}.tgz`;
  }
  return `${pkg.name}-${pkg.version}.tgz`;
}

/**
 * 对照清单校验 taskDir 下实际存在的 .tgz 文件，
 * 返回缺失的包（即"未抛错但文件没生成"的静默丢失）。
 *
 * @param taskDir 下载目录
 * @param packages 包清单（每个元素含 name / version，scope 可选）
 * @returns 缺失文件的包信息列表（name 为含 scope 的全名，便于展示）
 */
export function findMissingPackages(
  taskDir: string,
  packages: ReadonlyArray<{ scope?: string; name: string; version: string }>
): Array<{ name: string; version: string }> {
  const missing: Array<{ name: string; version: string }> = [];
  for (const pkg of packages) {
    const fileName = buildTgzFileName(pkg);
    const filePath = path.join(taskDir, fileName);
    // 必须存在且大小 > 0（防止空文件混入）
    let exists = false;
    try {
      const stat = fs.statSync(filePath);
      exists = stat.size > 0;
    } catch {
      exists = false;
    }
    if (!exists) {
      // 全名：scoped → "scope/name"，普通 → name（便于前端展示）
      const fullName = pkg.scope ? `${pkg.scope}/${pkg.name}` : pkg.name;
      missing.push({ name: fullName, version: pkg.version });
    }
  }
  return missing;
}

/**
 * 把"缺失包"合并进已有的 failedPackages 列表。
 *
 * 不可变：返回新数组，不修改入参。
 * 幂等：已存在的（按 name+version+error 去重）不重复添加。
 *
 * @param existing 已收集的失败列表（来自下载抛错）
 * @param missing 缺失文件清单
 * @returns 合并后的新数组
 */
export function mergeMissingFailures(
  existing: ReadonlyArray<FailedPackage>,
  missing: ReadonlyArray<{ name: string; version: string }>
): FailedPackage[] {
  const result: FailedPackage[] = [...existing];
  const seen = new Set(
    existing.map((f) => `${f.name}@${f.version}`)
  );
  for (const m of missing) {
    const key = `${m.name}@${m.version}`;
    if (!seen.has(key)) {
      result.push({
        name: m.name,
        version: m.version,
        error: "missing after download",
      });
      seen.add(key);
    }
  }
  return result;
}

/**
 * 依据"成功数 / 总数 / 失败清单"推断任务终态。
 *
 * 规则：
 *  - 总数为 0：failed（无包可下载视为失败）
 *  - 失败清单为空：completed（全部成功）
 *  - 成功数为 0：failed（全部失败）
 *  - 否则：partial（部分成功，ZIP 仍可用）
 *
 * @param successCount 成功下载的包数
 * @param totalPackages 总包数
 * @param failedPackages 失败的包清单
 * @returns 终态（completed / partial / failed）
 */
export function decideFinalStatus(
  successCount: number,
  totalPackages: number,
  failedPackages: ReadonlyArray<FailedPackage>
): TaskStatus {
  if (totalPackages === 0) return "failed";
  if (failedPackages.length === 0) return "completed";
  if (successCount === 0) return "failed";
  return "partial";
}
