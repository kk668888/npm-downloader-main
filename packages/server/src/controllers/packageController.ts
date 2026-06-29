import fs from "fs";
import path from "path";
import type { Response } from "express";
import { JsonController, Post, Body, Res } from "routing-controllers";
import pLimit from "p-limit";
import pacote from "pacote";
import type { FailedPackage, TaskStatus } from "@npm-downloader/types";
import { upsertHistoryItem } from "../services/history.js";
import { TEMP_DIR } from "../middleware/dirs.js";
import { setTaskStatus, waitForAuditConfirmation, clearAuditConfirmation, getTaskStatus, createTaskAbortController, isTaskCancelled, removeTaskAbortController } from "../services/taskStatus.js";
import { auditPackages } from "../services/auditService.js";
import { addTaskLog } from "../services/taskLogger.js";
import { retryWithBackoff } from "../utils/retry.js";
import { createZip, formatBytes } from "../utils/zip.js";
import { ValidationError } from "../utils/errors.js";
import {
  decideFinalStatus,
  findMissingPackages,
  mergeMissingFailures,
} from "../utils/downloadFinalize.js";
import crypto from "crypto";

@JsonController()
export class PackageController {
  @Post("/download-package")
  async downloadPackage(@Body() body: { packageName?: string; folderName?: string; blockCritical?: boolean }, @Res() res: Response) {
    try {
      const packageName = body.packageName;
      if (!packageName) {
        throw new ValidationError("Package name is required");
      }

      const taskId = crypto.randomUUID();

      // 获取用户自定义的文件夹名称（可选）
      const folderName = body.folderName || undefined;
      // 超危停止开关：默认 true（阻止）
      const blockCritical = body.blockCritical !== false;

      upsertHistoryItem(taskId, {
        type: "package",
        status: "pending",
        message: "Initializing...",
        packageName,
        zipUrl: `/api/download/${taskId}`,
        folderName,
      });
      setTaskStatus(taskId, "pending", "Initializing...", undefined, undefined, folderName);

      // 使用 folderName 或 taskId 作为目录名（剔除不合法字符）
      const dirName = folderName
        ? folderName.replace(/[\\/:*?"<>|]/g, "_").trim() || taskId
        : taskId;
      const taskDir = path.join(TEMP_DIR, dirName);
      fs.mkdirSync(taskDir, { recursive: true });

      const allPackages = new Map<string, string>();

      const resolveDependencies = async (
        name: string,
        version: string = "latest"
      ) => {
        try {
          const manifest = await pacote.manifest(`${name}@${version}`);
          const pkgName = manifest.name;
          const pkgVersion = manifest.version;
          const key = `${pkgName}@${pkgVersion}`;

          if (allPackages.has(key)) return;
          allPackages.set(key, pkgVersion);

          const dependencies = manifest.dependencies || {};
          for (const [depName, depVersion] of Object.entries(dependencies)) {
            await resolveDependencies(depName, depVersion);
          }
        } catch (e) {
          console.error(`Failed to resolve ${name}@${version}`, e);
        }
      };

      const downloadAll = async () => {
        // 创建 AbortController，用于支持任务取消
        createTaskAbortController(taskId);
        try {
          setTaskStatus(taskId, "processing", "Resolving dependencies...");
          addTaskLog(
            taskId,
            "info",
            `Resolving dependencies for ${packageName}...`
          );
          console.log(`Resolving dependencies for ${packageName}...`);

          const lastAtIndex = packageName.lastIndexOf("@");
          let name = packageName;
          let version = "latest";

          if (lastAtIndex > 0) {
            name = packageName.substring(0, lastAtIndex);
            version = packageName.substring(lastAtIndex + 1);
          }

          await resolveDependencies(name, version);
          console.log(`Resolved ${allPackages.size} packages.`);

          // Get the actual version of the main package
          const mainPackageKey = allPackages.keys().next().value;
          const mainPackageVersion = mainPackageKey
            ? mainPackageKey.substring(mainPackageKey.lastIndexOf("@") + 1)
            : undefined;

          addTaskLog(taskId, "info", `Resolved ${allPackages.size} packages`);

          // ===== 安全审计阶段 =====
          setTaskStatus(taskId, "auditing", "正在审计包安全性...");
          upsertHistoryItem(taskId, {
            status: "auditing",
            message: "正在审计包安全性...",
          });

          const packageArray = Array.from(allPackages.entries()).map(
            ([key, ver]) => ({
              name: key.substring(0, key.lastIndexOf("@")),
              version: ver,
            })
          );
          const auditReport = await auditPackages(taskId, packageArray, blockCritical);
          setTaskStatus(taskId, "auditing", "安全审计完成", undefined, auditReport);

          // safe 自动继续，blocked 直接失败，risky 和 unavailable 需要用户确认
          if (auditReport.auditStatus === "blocked") {
            addTaskLog(
              taskId,
              "error",
              `发现 ${auditReport.summary.critical} 个严重漏洞，任务已阻止`
            );
            setTaskStatus(taskId, "failed", "发现严重安全漏洞，下载已被阻止");
            return;
          }

          if (auditReport.auditStatus !== "safe") {
            if (auditReport.auditStatus === "unavailable") {
              addTaskLog(
                taskId,
                "warn",
                `审计不可用（${auditReport.reason || "未知原因"}），等待用户确认...`
              );
            } else {
              addTaskLog(
                taskId,
                "warn",
                `发现 ${auditReport.vulnerablePackages} 个包存在安全风险，等待用户确认...`
              );
            }

            try {
              await waitForAuditConfirmation(taskId);
              addTaskLog(taskId, "info", "用户确认继续下载");
            } catch (err) {
              if (err instanceof Error && err.message === "AUDIT_CONFIRMATION_TIMEOUT") {
                addTaskLog(taskId, "error", "审计确认超时（15分钟），任务已取消");
                setTaskStatus(taskId, "failed", "审计确认超时");
                clearAuditConfirmation(taskId);
                return;
              }
              throw err;
            }
          }

          // ===== 下载阶段 =====
          setTaskStatus(
            taskId,
            "processing",
            `Downloading ${allPackages.size} packages...`
          );
          upsertHistoryItem(taskId, {
            packagesCount: allPackages.size,
            packageVersion: mainPackageVersion,
          });

          const limit = pLimit(10);
          let successCount = 0;
          let failCount = 0;
          let completedCount = 0;
          const totalPackages = allPackages.size;
          // 收集下载失败的包（含 scope 全名），用于终态判定与历史记录暴露
          const failedPackages: FailedPackage[] = [];
          // 同时维护清单（合并形态 name + version），供后续缺失校验
          const packageList: Array<{ name: string; version: string }> = [];

          const downloadPromises = Array.from(allPackages.entries()).map(
            ([key, resolvedVersion]) => {
              const pkgName = key.substring(0, key.lastIndexOf("@"));
              packageList.push({ name: pkgName, version: resolvedVersion });
              return limit(async () => {
                // 每个包下载前检查任务是否已被取消
                if (isTaskCancelled(taskId)) {
                  return;
                }

                const spec = `${pkgName}@${resolvedVersion}`;
                const fileName = pkgName.startsWith("@")
                  ? `${pkgName
                      .substring(1)
                      .replace("/", "-")}-${resolvedVersion}.tgz`
                  : `${pkgName}-${resolvedVersion}.tgz`;

                // maxAttempts 默认 5；不可重试错误（如 404）立即抛出
                try {
                  await retryWithBackoff(
                    () =>
                      pacote.tarball.file(spec, path.join(taskDir, fileName)),
                    {
                      onRetry: (attempt, error) => {
                        const err = error instanceof Error ? error.message : "Unknown error";
                        addTaskLog(taskId, "warn", `Retry ${attempt} for ${spec}: ${err}`);
                      },
                    }
                  );
                  successCount++;
                  completedCount++;
                  addTaskLog(taskId, "info", `✓ Downloaded ${spec}`);
                  setTaskStatus(
                    taskId,
                    "processing",
                    `Downloading packages... (${completedCount}/${totalPackages})`,
                    { current: completedCount, total: totalPackages }
                  );
                } catch (error) {
                  failCount++;
                  completedCount++;
                  const errMsg = error instanceof Error ? error.message : "Unknown error";
                  // 收集失败包（不可变 push 到局部数组；pkgName 入参未被 mutate）
                  failedPackages.push({ name: pkgName, version: resolvedVersion, error: errMsg });
                  addTaskLog(taskId, "error", `✗ Failed ${spec}: ${errMsg}`);
                  setTaskStatus(
                    taskId,
                    "processing",
                    `Downloading packages... (${completedCount}/${totalPackages})`,
                    { current: completedCount, total: totalPackages }
                  );
                }
              });
            }
          );

          await Promise.all(downloadPromises);

          // 下载完成后检查任务是否已被取消，如果取消则清理临时文件
          if (isTaskCancelled(taskId)) {
            // 清理临时下载目录
            if (fs.existsSync(taskDir)) {
              fs.rmSync(taskDir, { recursive: true, force: true });
            }
            // 清理可能已生成的 ZIP 文件
            const zipPath = path.join(TEMP_DIR, `${dirName}.zip`);
            if (fs.existsSync(zipPath)) {
              fs.unlinkSync(zipPath);
            }
            addTaskLog(taskId, "info", "任务已被用户取消");
            return;
          }

          // ===== 关键校验：对照清单检查实际落盘的 .tgz，抓"未抛错但静默丢失" =====
          const missing = findMissingPackages(taskDir, packageList);
          const allFailedPackages = mergeMissingFailures(failedPackages, missing);
          if (missing.length > 0) {
            addTaskLog(
              taskId,
              "warn",
              `检测到 ${missing.length} 个包文件缺失（已从清单中标记为失败）`
            );
            failCount += missing.length;
          }

          // ===== 终态判定：completed / partial / failed =====
          const finalStatus: TaskStatus = decideFinalStatus(
            successCount,
            totalPackages,
            allFailedPackages
          );

          addTaskLog(
            taskId,
            "info",
            `Download complete: ${successCount} succeeded, ${failCount} failed (final status: ${finalStatus})`
          );

          setTaskStatus(taskId, "processing", "Compressing files...");

          const zipPath = path.join(TEMP_DIR, `${dirName}.zip`);
          // partial 时 ZIP 照常生成（只含成功的包），zipUrl 仍可用
          const zipBytes = await createZip(taskDir, zipPath);

          addTaskLog(taskId, "info", `ZIP created: ${formatBytes(zipBytes)} MB`);

          // 终态信息 + 失败清单同步到任务状态与历史记录（供前端读取）
          const finalMessage =
            finalStatus === "completed"
              ? "Download complete"
              : finalStatus === "partial"
              ? `部分包下载失败（${allFailedPackages.length} 个），ZIP 仅包含成功的包`
              : "All packages failed to download";
          setTaskStatus(taskId, finalStatus, finalMessage, undefined, undefined, undefined, allFailedPackages);
          upsertHistoryItem(taskId, {
            status: finalStatus,
            message: finalMessage,
            failedPackages: allFailedPackages.length > 0 ? allFailedPackages : undefined,
          });
        } catch (e) {
          console.error("Download package failed", e);
          setTaskStatus(taskId, "failed", "Download failed");
        } finally {
          // 任务结束（无论成功、失败还是取消）都清理 AbortController，释放内存
          removeTaskAbortController(taskId);
        }
      };

      downloadAll();

      // 获取初始化时生成的 token，随响应返回给前端
      const taskStatusItem = getTaskStatus(taskId);

      return {
        taskId,
        token: taskStatusItem?.token,
        message: "Download started",
        zipUrl: `/api/download/${taskId}`,
      };
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      console.error(error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
}
