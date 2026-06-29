import type { Request, Response } from "express";
import { MulterError } from "multer";
import fs from "fs";
import { JsonController, Post, Req, Res, UseBefore } from "routing-controllers";
import path from "path";
import pLimit from "p-limit";
import {
  downloadTgzFile,
  parseLockFile,
  parsePackageTgzUrl,
  type PackageInfo,
  type PackageUrlInfo,
} from "@npm-downloader/core";
import type { FailedPackage, SkippedDep, TaskStatus } from "@npm-downloader/types";
import crypto from "crypto";
import { uploadSingleLockfile } from "../middleware/upload.js";
import { TEMP_DIR } from "../middleware/dirs.js";
import { upsertHistoryItem } from "../services/history.js";
import { auditPackages } from "../services/auditService.js";
import {
  clearAuditConfirmation,
  createTaskAbortController,
  getTaskStatus,
  isTaskCancelled,
  removeTaskAbortController,
  setTaskStatus,
  waitForAuditConfirmation,
} from "../services/taskStatus.js";
import { addTaskLog } from "../services/taskLogger.js";
import { cleanupAll } from "../utils/cleanup.js";
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

function getFullPackageName(pkg: Pick<PackageInfo, "scope" | "name">): string {
  return pkg.scope ? `${pkg.scope}/${pkg.name}` : pkg.name;
}

@JsonController()
export class LockfileController {
  @Post("/upload")
  @UseBefore(uploadSingleLockfile)
  async uploadLockfile(@Req() req: Request, @Res() res: Response) {
    let uploadedFilePath: string | null = null;
    let tempLockfileDir: string | null = null;

    try {
      if (!req.file) {
        throw new ValidationError("No file uploaded");
      }

      uploadedFilePath = req.file.path;

      tempLockfileDir = path.join(TEMP_DIR, `lockfile-${crypto.randomUUID()}`);
      fs.mkdirSync(tempLockfileDir, { recursive: true });

      const tempLockfilePath = path.join(tempLockfileDir, "pnpm-lock.yaml");
      fs.copyFileSync(uploadedFilePath, tempLockfilePath);

      fs.unlinkSync(uploadedFilePath);
      uploadedFilePath = null;

      const parseResult = await parseLockFile(tempLockfilePath);

      if (tempLockfileDir) {
        fs.rmSync(tempLockfileDir, { recursive: true, force: true });
        tempLockfileDir = null;
      }

      if (!parseResult || parseResult.packages.length === 0) {
        throw new ValidationError("Failed to parse lockfile or no packages found");
      }

      const { packages, skipped } = parseResult;
      const taskId = crypto.randomUUID();
      addTaskLog(taskId, "info", `解析到 ${packages.length} 个包（共 ${parseResult.totalEntries} 条记录）`);

      if (skipped.length > 0) {
        const uniqueReasons = [...new Set(skipped.map((item) => item.reason))];
        addTaskLog(
          taskId,
          "warn",
          `跳过 ${skipped.length} 个非 registry 依赖: ${uniqueReasons.join(", ")}`
        );
      }

      const folderName = (req.body?.folderName as string) || undefined;
      const blockCritical =
        req.body?.blockCritical !== "false" && req.body?.blockCritical !== "0";

      setTaskStatus(taskId, "pending", "准备中...", undefined, undefined, folderName);

      upsertHistoryItem(taskId, {
        type: "lockfile",
        status: "pending",
        message: "准备中...",
        packagesCount: packages.length,
        zipUrl: `/api/download/${taskId}`,
        folderName,
      });

      const taskStatusItem = getTaskStatus(taskId);

      processAll(taskId, packages, skipped, folderName, blockCritical).catch((error) => {
        console.error("Lockfile processing failed:", error);
      });

      return res.json({
        taskId,
        token: taskStatusItem?.token,
        message: "Upload accepted, processing started",
        zipUrl: `/api/download/${taskId}`,
      });
    } catch (error) {
      await cleanupAll([uploadedFilePath], [tempLockfileDir]);

      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }

      if (error instanceof MulterError && error.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: "文件大小超过 10MB 限制" });
      }

      console.error(error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
}

async function processAll(
  taskId: string,
  packages: PackageInfo[],
  skippedDeps: SkippedDep[],
  folderName?: string,
  blockCritical?: boolean
): Promise<void> {
  createTaskAbortController(taskId);

  try {
    setTaskStatus(taskId, "auditing", "正在审计包安全...");
    upsertHistoryItem(taskId, {
      status: "auditing",
      message: "正在审计包安全...",
    });

    const auditReport = await auditPackages(
      taskId,
      packages.map((pkg) => ({
        name: getFullPackageName(pkg),
        version: pkg.version,
      })),
      blockCritical
    );

    const reportWithSkipped = {
      ...auditReport,
      skippedDeps: skippedDeps.length > 0 ? skippedDeps : undefined,
    };
    setTaskStatus(taskId, "auditing", "安全审计完成", undefined, reportWithSkipped);

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

    upsertHistoryItem(taskId, {
      status: "processing",
      message: "正在下载包...",
    });
    setTaskStatus(taskId, "processing", "正在下载包...");

    const dirName = folderName
      ? folderName.replace(/[\\/:*?"<>|]/g, "_").trim() || taskId
      : taskId;
    const taskDir = path.join(TEMP_DIR, dirName);
    fs.mkdirSync(taskDir, { recursive: true });

    const packageBySpec = new Map<string, PackageInfo>(
      packages.map((pkg) => [`${getFullPackageName(pkg)}@${pkg.version}`, pkg])
    );

    const totalPackages = packages.length;
    const limit = pLimit(DOWNLOAD_CONCURRENCY);
    let successCount = 0;
    let failCount = 0;
    let completedCount = 0;
    const failedPackages: FailedPackage[] = [];

    const downloadPromises = packages.map((pkg) =>
      limit(async () => {
        if (isTaskCancelled(taskId)) {
          return;
        }

        const urlInfo: PackageUrlInfo = {
          ...pkg,
          url: parsePackageTgzUrl(pkg),
        };
        const fullName = getFullPackageName(pkg);
        const pkgSpec = `${fullName}@${pkg.version}`;

        try {
          await retryWithBackoff(() => downloadTgzFile(urlInfo, taskDir), {
            maxAttempts: AUTO_RETRY_ATTEMPTS,
            onRetry: (attempt, error) => {
              const err = error instanceof Error ? error.message : "Unknown error";
              addTaskLog(taskId, "warn", `Retry ${attempt} for ${pkgSpec}: ${err}`);
            },
          });

          successCount++;
          completedCount++;
          addTaskLog(taskId, "info", `Downloaded ${pkgSpec}`);
        } catch (error) {
          failCount++;
          completedCount++;
          const errMsg = error instanceof Error ? error.message : "Unknown error";
          failedPackages.push({ name: fullName, version: pkg.version, error: errMsg });
          addTaskLog(taskId, "error", `Failed ${pkgSpec}: ${errMsg}`);
        }

        setTaskStatus(
          taskId,
          "processing",
          `Downloading packages... (${completedCount}/${totalPackages})`,
          { current: completedCount, total: totalPackages }
        );
      })
    );

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
        const pkgSpec = `${failedPackage.name}@${failedPackage.version}`;
        const pkg = packageBySpec.get(pkgSpec);
        if (!pkg) {
          throw new Error("Package metadata not found for retry");
        }

        const urlInfo: PackageUrlInfo = {
          ...pkg,
          url: parsePackageTgzUrl(pkg),
        };

        addTaskLog(taskId, "info", `Retry pass download for ${pkgSpec}`);

        await retryWithBackoff(() => downloadTgzFile(urlInfo, taskDir), {
          maxAttempts: AUTO_RETRY_ATTEMPTS,
          onRetry: (attempt, error) => {
            const err = error instanceof Error ? error.message : "Unknown error";
            addTaskLog(taskId, "warn", `Retry pass ${attempt} for ${pkgSpec}: ${err}`);
          },
        });
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

    const missing = findMissingPackages(taskDir, packages);
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
        ? "Download and compression complete"
        : finalStatus === "partial"
          ? `部分包下载失败（${allFailedPackages.length} 个），ZIP 仅包含成功的包`
          : "All packages failed to download";

    setTaskStatus(taskId, finalStatus, finalMessage, undefined, undefined, undefined, allFailedPackages);
    upsertHistoryItem(taskId, {
      status: finalStatus,
      message: finalMessage,
      failedPackages: allFailedPackages.length > 0 ? allFailedPackages : undefined,
      zipUrl: `/api/download/${taskId}`,
    });
  } catch (error) {
    console.error(error);
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    addTaskLog(taskId, "error", `Task failed: ${errMsg}`);
    setTaskStatus(taskId, "failed", "Internal server error");
  } finally {
    removeTaskAbortController(taskId);
  }
}
