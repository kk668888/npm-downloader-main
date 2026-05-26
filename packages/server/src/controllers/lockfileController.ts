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
import type { SkippedDep } from "@npm-downloader/types";
import { upsertHistoryItem } from "../services/history.js";
import { TEMP_DIR } from "../middleware/dirs.js";
import { setTaskStatus, waitForAuditConfirmation, clearAuditConfirmation, getTaskStatus, createTaskAbortController, isTaskCancelled, removeTaskAbortController } from "../services/taskStatus.js";
import { auditPackages } from "../services/auditService.js";
import { uploadSingleLockfile } from "../middleware/upload.js";
import { addTaskLog } from "../services/taskLogger.js";
import { retryWithBackoff } from "../utils/retry.js";
import { createZip, formatBytes } from "../utils/zip.js";
import { cleanupAll } from "../utils/cleanup.js";
import { ValidationError } from "../utils/errors.js";
import crypto from "crypto";

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

      // 创建临时目录，将上传文件复制为 pnpm-lock.yaml
      tempLockfileDir = path.join(TEMP_DIR, `lockfile-${crypto.randomUUID()}`);
      fs.mkdirSync(tempLockfileDir, { recursive: true });

      const tempLockfilePath = path.join(tempLockfileDir, "pnpm-lock.yaml");
      fs.copyFileSync(uploadedFilePath, tempLockfilePath);

      // 立即清理上传文件
      fs.unlinkSync(uploadedFilePath);
      uploadedFilePath = null;

      const parseResult = await parseLockFile(tempLockfilePath);

      // 清理临时 lockfile 目录
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

      // 记录被跳过的非 registry 依赖
      if (skipped.length > 0) {
        const reasons = skipped.map((s) => s.reason);
        const uniqueReasons = [...new Set(reasons)];
        addTaskLog(
          taskId,
          "warn",
          `跳过 ${skipped.length} 个非 registry 依赖: ${uniqueReasons.join(", ")}`
        );
      }

      // 从 FormData 中获取用户自定义的文件夹名称（multer 处理后 req.body 才有值）
      const folderName = (req.body?.folderName as string) || undefined;

      // 初始化任务状态（会自动生成 token，同时保存 folderName）
      setTaskStatus(taskId, "pending", "准备中...", undefined, undefined, folderName);

      upsertHistoryItem(taskId, {
        type: "lockfile",
        status: "pending",
        message: "准备中...",
        packagesCount: packages.length,
        zipUrl: `/api/download/${taskId}`,
        folderName,
      });

      // 获取初始化时生成的 token，随响应返回给前端
      const taskStatusItem = getTaskStatus(taskId);

      // Fire-and-forget：立即返回 taskId + token，后台执行审计+下载
      processAll(taskId, packages, skipped, folderName).catch((err) => {
        console.error("Lockfile processing failed:", err);
      });

      return res.json({
        taskId,
        token: taskStatusItem?.token,
        message: "Upload accepted, processing started",
        zipUrl: `/api/download/${taskId}`,
      });
    } catch (error) {
      // 清理临时文件
      await cleanupAll([uploadedFilePath], [tempLockfileDir]);
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      // multer 文件大小超限
      if (error instanceof MulterError && error.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: "文件大小超过 10MB 限制" });
      }
      console.error(error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
}

/**
 * 后台执行完整流程：审计 → 等待确认 → 下载 → 打包
 *
 * @param taskId 任务 ID
 * @param packages 解析到的包列表
 * @param skippedDeps 被跳过的非 registry 依赖
 * @param folderName 用户自定义的文件夹名称（可选，用于 ZIP 下载文件名）
 */
async function processAll(
  taskId: string,
  packages: PackageInfo[],
  skippedDeps: SkippedDep[],
  folderName?: string
): Promise<void> {
  // 创建 AbortController，用于支持任务取消
  createTaskAbortController(taskId);

  try {
    // ===== 安全审计阶段 =====
    setTaskStatus(taskId, "auditing", "正在审计包安全性...");
    upsertHistoryItem(taskId, {
      status: "auditing",
      message: "正在审计包安全性...",
    });

    const auditReport = await auditPackages(
      taskId,
      packages.map((p: PackageInfo) => ({
        name: p.scope ? `${p.scope}/${p.name}` : p.name,
        version: p.version,
      }))
    );

    // 存储审计报告到任务状态（附带 skippedDeps）
    const reportWithSkipped = {
      ...auditReport,
      skippedDeps: skippedDeps.length > 0 ? skippedDeps : undefined,
    };
    setTaskStatus(taskId, "auditing", "安全审计完成", undefined, reportWithSkipped);

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
    upsertHistoryItem(taskId, {
      status: "processing",
      message: "正在下载包...",
    });
    setTaskStatus(taskId, "processing", "正在下载包...");

    // 使用 folderName 或 taskId 作为目录名（剔除不合法字符）
    const dirName = folderName
      ? folderName.replace(/[\\/:*?"<>|]/g, "_").trim() || taskId
      : taskId;
    const taskDir = path.join(TEMP_DIR, dirName);
    fs.mkdirSync(taskDir, { recursive: true });

    const limit = pLimit(10);
    let successCount = 0;
    let failCount = 0;
    let completedCount = 0;
    const totalPackages = packages.length;

    const downloadPromises = packages.map((pkg: PackageInfo) => {
      return limit(async () => {
        // 每个包下载前检查任务是否已被取消
        if (isTaskCancelled(taskId)) {
          return;
        }

        const urlInfo: PackageUrlInfo = {
          ...pkg,
          url: parsePackageTgzUrl(pkg),
        };
        const fullName = pkg.scope ? `${pkg.scope}/${pkg.name}` : pkg.name;
        const pkgSpec = `${fullName}@${pkg.version}`;

        try {
          await retryWithBackoff(
            () => downloadTgzFile(urlInfo, taskDir),
            {
              maxAttempts: 3,
              onRetry: (attempt, error) => {
                addTaskLog(taskId, "warn", `Retry ${attempt}/2 for ${pkgSpec}`);
              },
            }
          );
          successCount++;
          completedCount++;
          addTaskLog(taskId, "info", `✓ Downloaded ${pkgSpec}`);
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
          addTaskLog(taskId, "error", `✗ Failed ${pkgSpec}: ${errMsg}`);
          setTaskStatus(
            taskId,
            "processing",
            `Downloading packages... (${completedCount}/${totalPackages})`,
            { current: completedCount, total: totalPackages }
          );
          console.error(`Failed to download ${pkgSpec}:`, error);
        }
      });
    });

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

    addTaskLog(
      taskId,
      "info",
      `Download complete: ${successCount} succeeded, ${failCount} failed`
    );
    setTaskStatus(taskId, "processing", "Compressing files...");

    const zipPath = path.join(TEMP_DIR, `${dirName}.zip`);
    const zipBytes = await createZip(taskDir, zipPath);

    addTaskLog(taskId, "info", `ZIP created: ${formatBytes(zipBytes)} MB`);
    setTaskStatus(taskId, "completed", "Download and compression complete");
    upsertHistoryItem(taskId, { zipUrl: `/api/download/${taskId}` });
  } catch (error) {
    console.error(error);
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    addTaskLog(taskId, "error", `Task failed: ${errMsg}`);
    setTaskStatus(taskId, "failed", "Internal server error");
  } finally {
    // 任务结束（无论成功、失败还是取消）都清理 AbortController，释放内存
    removeTaskAbortController(taskId);
  }
}
