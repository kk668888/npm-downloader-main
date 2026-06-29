import fs from "fs";
import path from "path";
import type { Response } from "express";
import { Body, JsonController, Post, Res } from "routing-controllers";
import pLimit from "p-limit";
import pacote from "pacote";
import type { FailedPackage, TaskStatus } from "@npm-downloader/types";
import crypto from "crypto";
import { TEMP_DIR } from "../middleware/dirs.js";
import { upsertHistoryItem } from "../services/history.js";
import {
  clearAuditConfirmation,
  createTaskAbortController,
  getTaskStatus,
  isTaskCancelled,
  removeTaskAbortController,
  setTaskStatus,
  waitForAuditConfirmation,
} from "../services/taskStatus.js";
import { auditPackages } from "../services/auditService.js";
import { addTaskLog } from "../services/taskLogger.js";
import {
  decideFinalStatus,
  findMissingPackages,
  mergeMissingFailures,
  retryFailedPackages,
} from "../utils/downloadFinalize.js";
import { ValidationError } from "../utils/errors.js";
import { retryWithBackoff } from "../utils/retry.js";
import { createZip, formatBytes } from "../utils/zip.js";

const DOWNLOAD_CONCURRENCY = 10;
const AUTO_RETRY_ATTEMPTS = 3;

interface ResolvedPackage {
  name: string;
  version: string;
}

@JsonController()
export class PackageController {
  @Post("/download-package")
  async downloadPackage(
    @Body() body: { packageName?: string; folderName?: string; blockCritical?: boolean },
    @Res() res: Response
  ) {
    try {
      const packageName = body.packageName;
      if (!packageName) {
        throw new ValidationError("Package name is required");
      }

      const taskId = crypto.randomUUID();
      const folderName = body.folderName || undefined;
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

      const dirName = folderName
        ? folderName.replace(/[\\/:*?"<>|]/g, "_").trim() || taskId
        : taskId;
      const taskDir = path.join(TEMP_DIR, dirName);
      fs.mkdirSync(taskDir, { recursive: true });

      const allPackages = new Map<string, string>();

      const resolveDependencies = async (name: string, version = "latest") => {
        try {
          const manifest = await pacote.manifest(`${name}@${version}`);
          const pkgName = manifest.name;
          const pkgVersion = manifest.version;
          const key = `${pkgName}@${pkgVersion}`;

          if (allPackages.has(key)) {
            return;
          }
          allPackages.set(key, pkgVersion);

          const dependencies = manifest.dependencies || {};
          for (const [depName, depVersion] of Object.entries(dependencies)) {
            await resolveDependencies(depName, depVersion);
          }
        } catch (error) {
          console.error(`Failed to resolve ${name}@${version}`, error);
        }
      };

      const downloadAll = async () => {
        createTaskAbortController(taskId);

        try {
          setTaskStatus(taskId, "processing", "Resolving dependencies...");
          addTaskLog(taskId, "info", `Resolving dependencies for ${packageName}...`);

          const lastAtIndex = packageName.lastIndexOf("@");
          let name = packageName;
          let version = "latest";

          if (lastAtIndex > 0) {
            name = packageName.substring(0, lastAtIndex);
            version = packageName.substring(lastAtIndex + 1);
          }

          await resolveDependencies(name, version);
          addTaskLog(taskId, "info", `Resolved ${allPackages.size} packages`);

          const mainPackageKey = allPackages.keys().next().value as string | undefined;
          const mainPackageVersion = mainPackageKey
            ? mainPackageKey.substring(mainPackageKey.lastIndexOf("@") + 1)
            : undefined;

          setTaskStatus(taskId, "auditing", "正在审计包安全...");
          upsertHistoryItem(taskId, {
            status: "auditing",
            message: "正在审计包安全...",
          });

          const packageArray = Array.from(allPackages.entries()).map(([key, resolvedVersion]) => ({
            name: key.substring(0, key.lastIndexOf("@")),
            version: resolvedVersion,
          }));

          const auditReport = await auditPackages(taskId, packageArray, blockCritical);
          setTaskStatus(taskId, "auditing", "安全审计完成", undefined, auditReport);

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
            } catch (error) {
              if (error instanceof Error && error.message === "AUDIT_CONFIRMATION_TIMEOUT") {
                addTaskLog(taskId, "error", "审计确认超时（15 分钟），任务已取消");
                setTaskStatus(taskId, "failed", "审计确认超时");
                clearAuditConfirmation(taskId);
                return;
              }

              throw error;
            }
          }

          setTaskStatus(taskId, "processing", `Downloading ${allPackages.size} packages...`);
          upsertHistoryItem(taskId, {
            packagesCount: allPackages.size,
            packageVersion: mainPackageVersion,
          });

          const limit = pLimit(DOWNLOAD_CONCURRENCY);
          const totalPackages = allPackages.size;
          let successCount = 0;
          let failCount = 0;
          let completedCount = 0;
          const failedPackages: FailedPackage[] = [];
          const packageList: ResolvedPackage[] = [];
          const packageBySpec = new Map<string, ResolvedPackage>();

          const downloadPromises = Array.from(allPackages.entries()).map(([key, resolvedVersion]) => {
            const pkgName = key.substring(0, key.lastIndexOf("@"));
            const pkg: ResolvedPackage = { name: pkgName, version: resolvedVersion };
            packageList.push(pkg);
            packageBySpec.set(`${pkgName}@${resolvedVersion}`, pkg);

            return limit(async () => {
              if (isTaskCancelled(taskId)) {
                return;
              }

              const spec = `${pkgName}@${resolvedVersion}`;
              const fileName = pkgName.startsWith("@")
                ? `${pkgName.substring(1).replace("/", "-")}-${resolvedVersion}.tgz`
                : `${pkgName}-${resolvedVersion}.tgz`;

              try {
                await retryWithBackoff(
                  () => pacote.tarball.file(spec, path.join(taskDir, fileName)),
                  {
                    maxAttempts: AUTO_RETRY_ATTEMPTS,
                    onRetry: (attempt, error) => {
                      const err = error instanceof Error ? error.message : "Unknown error";
                      addTaskLog(taskId, "warn", `Retry ${attempt} for ${spec}: ${err}`);
                    },
                  }
                );

                successCount++;
                completedCount++;
                addTaskLog(taskId, "info", `Downloaded ${spec}`);
              } catch (error) {
                failCount++;
                completedCount++;
                const errMsg = error instanceof Error ? error.message : "Unknown error";
                failedPackages.push({ name: pkgName, version: resolvedVersion, error: errMsg });
                addTaskLog(taskId, "error", `Failed ${spec}: ${errMsg}`);
              }

              setTaskStatus(
                taskId,
                "processing",
                `Downloading packages... (${completedCount}/${totalPackages})`,
                { current: completedCount, total: totalPackages }
              );
            });
          });

          await Promise.all(downloadPromises);

          if (isTaskCancelled(taskId)) {
            if (fs.existsSync(taskDir)) {
              fs.rmSync(taskDir, { recursive: true, force: true });
            }

            const zipPath = path.join(TEMP_DIR, `${dirName}.zip`);
            if (fs.existsSync(zipPath)) {
              fs.unlinkSync(zipPath);
            }

            addTaskLog(taskId, "info", "任务已被用户取消");
            return;
          }

          if (failedPackages.length > 0) {
            addTaskLog(
              taskId,
              "warn",
              `Initial pass finished with ${failedPackages.length} failed packages, retrying them once more`
            );
            setTaskStatus(taskId, "processing", "Retrying failed packages...");

            const retryResult = await retryFailedPackages(failedPackages, async (failedPackage) => {
              const spec = `${failedPackage.name}@${failedPackage.version}`;
              const pkg = packageBySpec.get(spec);
              if (!pkg) {
                throw new Error("Package metadata not found for retry");
              }

              const fileName = pkg.name.startsWith("@")
                ? `${pkg.name.substring(1).replace("/", "-")}-${pkg.version}.tgz`
                : `${pkg.name}-${pkg.version}.tgz`;

              addTaskLog(taskId, "info", `Retry pass download for ${spec}`);

              await retryWithBackoff(
                () => pacote.tarball.file(spec, path.join(taskDir, fileName)),
                {
                  maxAttempts: AUTO_RETRY_ATTEMPTS,
                  onRetry: (attempt, error) => {
                    const err = error instanceof Error ? error.message : "Unknown error";
                    addTaskLog(taskId, "warn", `Retry pass ${attempt} for ${spec}: ${err}`);
                  },
                }
              );
            });

            successCount += retryResult.recovered.length;
            failCount = retryResult.remaining.length;
            failedPackages.length = 0;
            failedPackages.push(...retryResult.remaining);

            addTaskLog(
              taskId,
              "info",
              `Retry pass complete: ${retryResult.recovered.length} recovered, ${retryResult.remaining.length} still failed`
            );
          }

          const missing = findMissingPackages(taskDir, packageList);
          const allFailedPackages = mergeMissingFailures(failedPackages, missing);
          if (missing.length > 0) {
            addTaskLog(taskId, "warn", `检测到 ${missing.length} 个包文件缺失，已按失败处理`);
            failCount += missing.length;
          }

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
          const zipBytes = await createZip(taskDir, zipPath);

          addTaskLog(taskId, "info", `ZIP created: ${formatBytes(zipBytes)} MB`);

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
        } catch (error) {
          console.error("Download package failed", error);
          setTaskStatus(taskId, "failed", "Download failed");
        } finally {
          removeTaskAbortController(taskId);
        }
      };

      downloadAll();

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
