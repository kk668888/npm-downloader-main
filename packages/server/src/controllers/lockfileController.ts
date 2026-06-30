import type { Request, Response } from "express";
import { MulterError } from "multer";
import fs from "fs";
import { JsonController, Post, Req, Res, UseBefore } from "routing-controllers";
import path from "path";
import pLimit from "p-limit";
import {
  downloadTgzFile,
  parseLockFile,
  resolvePackageUrl,
  type PackageInfo,
  type PackageUrlInfo,
  type PeerReserveCandidate,
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
import { resolvePeerReserve } from "../services/peerReserveService.js";
import { cleanupAll } from "../utils/cleanup.js";
import {
  decideFinalStatus,
  findMissingPackages,
  mergeMissingFailures,
  retryFailedPackages,
} from "../utils/downloadFinalize.js";
import { ValidationError } from "../utils/errors.js";
import {
  buildExistingSpecs,
  parseIncludePeerReserveFlag,
  racePeerReserveWithTimeout,
  type RacePeerReserveResult,
} from "../utils/peerReserveMerge.js";
import { retryWithBackoff } from "../utils/retry.js";
import { createZip, formatBytes } from "../utils/zip.js";

const DOWNLOAD_CONCURRENCY = 10;
const AUTO_RETRY_ATTEMPTS = 3;

/**
 * peer 储备联网解析的整体超时（毫秒）。
 *
 * 设计：peer 储备是可选增强，绝不能阻塞主下载流程。90s 是“用户可容忍的等待上限”
 * 与“通常足够完成 peer 解析”之间的权衡。到点 abort，已解析的部分
 * 仍然合并进主流程，未完成的记入 skipped（warn 日志），主流程继续走向 audit。
 *
 * 说明：peer 储备已改为 **非递归**（只解析每个根 peer 自身的 manifest，不展开 dependencies），
 *      十几个 peer 通常几秒内即可完成，该超时几乎不会触发；保留 Promise.race 仅作兜底。
 */
const PEER_RESERVE_TIMEOUT_MS = 90_000;

function getFullPackageName(pkg: Pick<PackageInfo, "scope" | "name">): string {
  return pkg.scope ? `${pkg.scope}/${pkg.name}` : pkg.name;
}

/**
 * Phase 3：解析 peer 储备候选并合并进 packages。
 *
 * 这是 processAll 的一个内部步骤（在 audit 之前执行）：
 *   1) 开关关闭 或 无候选 → 直接返回原 packages（行为与历史完全一致，不联网）；
 *   2) 开关打开 且 有候选 →
 *      a. 基于 packages 构造 existingSpecs（lockfile 全集，去重口径与 service 一致）；
 *      b. 进入联网解析前把任务状态推进到 processing（避免“假死”）；
 *      c. 委托 racePeerReserveWithTimeout 执行“Promise.race 强制超时”：
 *         - 本地 setTimeout timeoutPromise 与 resolvePeerReserve race；
 *         - 超时赢得 race → 放弃 peer 储备，返回 [...packages]，主流程继续；
 *         - 正常 → 转换 + 不可变合并 peer 储备包；
 *      d. 把纯函数返回的 logEvents 逐条落到 addTaskLog（解耦纯函数与日志副作用）。
 *
 * 关键修复（第 2 次修复，前情见 commit 1f3118f）：
 *   上次用 AbortController + signal 超时，依赖“pacote 响应 signal 才能让
 *   resolvePeerReserve 返回”。实测 pacote@21 的 manifest 不响应 AbortSignal，
 *   service 内 Promise.all 永不 resolve、resolvePeerReserve 永不返回、controller 永久挂起。
 *   本次改为 controller 层 Promise.race([resolvePeerReserve, 本地 setTimeout timeoutPromise])：
 *   Node 事件循环保证 setTimeout 到点必然触发，**不再依赖 pacote 行为**。
 *   保留 AbortController 仅为“尽力停止内部请求、释放资源”，**不依赖**它让流程继续。
 *
 * immutability：永不修改入参 packages / candidates，始终返回新数组。
 * 失败隔离：service 内部已对单包失败做隔离（记入 skipped），
 *           本函数只在日志层暴露失败，绝不抛出中断主流程。
 *
 * @param taskId            任务 ID（日志用）
 * @param packages          lockfile 解析出的原始 packages（只读）
 * @param includePeerReserve peer 储备开关
 * @param candidates        Phase 1 产出的 peer 储备候选
 * @returns 合并后的 packages 数组（开关关闭时即原 packages 的副本）
 */
async function resolveAndMergePeerReserve(
  taskId: string,
  packages: ReadonlyArray<PackageInfo>,
  includePeerReserve: boolean,
  candidates: ReadonlyArray<PeerReserveCandidate>
): Promise<PackageInfo[]> {
  // 开关关闭 或 无候选：直接返回原 packages 的副本，行为与历史完全一致（关键：不破坏现有流程）
  if (!includePeerReserve || candidates.length === 0) {
    return [...packages];
  }

  // 1) 构造 existingSpecs（lockfile 全集），口径与 service 内 buildSpec 一致
  const existingSpecs = buildExistingSpecs(packages);

  // 进入联网解析前，先把任务状态从 pending 推进到 processing，避免用户看到“假死”。
  // peer 储备解析为非递归（每个根 peer 只请求一次 manifest），通常很快完成；
  // 仍给用户明确反馈，避免多 peer 候选时短暂等待被误判为“假死”。
  setTaskStatus(
    taskId,
    "processing",
    "正在联网解析 peer 储备(可能耗时较长)..."
  );

  addTaskLog(
    taskId,
    "info",
    `peer 储备：开始解析 ${candidates.length} 个候选（开关已开启，超时 ${PEER_RESERVE_TIMEOUT_MS / 1000}s）`
  );

  // 2) AbortController —— 仅为“尽力停止内部 pacote 请求、释放底层 socket”。
  //    **不依赖**它让 resolvePeerReserve 返回（实测 pacote@21 不响应 AbortSignal）。
  //    真正的超时强制由下面 racePeerReserveWithTimeout 内的 Promise.race 保证。
  const controller = new AbortController();
  const abortTimer = setTimeout(
    () => controller.abort(),
    PEER_RESERVE_TIMEOUT_MS
  );

  // 3) 委托纯函数：Promise.race([resolvePeerReserve, 本地 setTimeout timeoutPromise])。
  //    该函数把 race + 超时判定 + 转换 + 不可变合并全部封装为纯函数（无日志副作用），
  //    返回 { packages, logEvents, timedOut }，便于单测注入 mock 验证超时强制生效。
  let raced: RacePeerReserveResult;
  try {
    raced = await racePeerReserveWithTimeout({
      resolvePeerReserve,
      candidates,
      basePackages: packages,
      existingSpecs,
      timeoutMs: PEER_RESERVE_TIMEOUT_MS,
      signal: controller.signal,
      onProgress: (msg) => addTaskLog(taskId, "info", msg),
    });
  } finally {
    // finally 保证：无论正常 / 超时 / 异常，abortTimer 都被清理，不泄漏。
    // 注意：racePeerReserveWithTimeout 内部的 race timer 由它自己 finally 清理，
    //       这里清理的是 controller 的 abort timer。
    clearTimeout(abortTimer);
  }

  // 4) 把纯函数产出的日志事件逐条落到任务日志（纯函数本身不耦合 addTaskLog）。
  for (const evt of raced.logEvents) {
    addTaskLog(taskId, evt.level, evt.message);
  }

  return raced.packages;
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
      // Phase 3：Peer 储备开关。默认 false（不传 / 传非真值时行为与历史完全一致）。
      // 字段名固定为 includePeerReserve，Phase 4 前端将沿用。
      const includePeerReserve = parseIncludePeerReserveFlag(
        req.body?.includePeerReserve
      );

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

      // 把 includePeerReserve 与 candidates 一并传入 processAll：
      // peer 储备解析涉及联网（pacote），必须放在异步段（audit 之前），
      // 不能放在请求同步段，否则会阻塞 HTTP 响应。
      processAll(
        taskId,
        packages,
        skipped,
        folderName,
        blockCritical,
        includePeerReserve,
        parseResult.peerReserveCandidates
      ).catch((error) => {
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
  blockCritical?: boolean,
  includePeerReserve: boolean = false,
  peerReserveCandidates: PeerReserveCandidate[] = []
): Promise<void> {
  createTaskAbortController(taskId);

  try {
    // —— Phase 3：Peer 储备解析（在 audit 之前）——
    // 仅当开关打开且存在候选时才联网解析；否则 packages 保持原样，
    // 行为与未集成 peer 储备时完全一致（关键：不破坏现有流程）。
    // 解析失败（service 内部已失败隔离）不影响主流程，仅记录 warn 日志。
    const resolvedPackages = await resolveAndMergePeerReserve(
      taskId,
      packages,
      includePeerReserve,
      peerReserveCandidates
    );

    setTaskStatus(taskId, "auditing", "正在审计包安全...");
    upsertHistoryItem(taskId, {
      status: "auditing",
      message: "正在审计包安全...",
    });

    const auditReport = await auditPackages(
      taskId,
      resolvedPackages.map((pkg) => ({
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
      resolvedPackages.map((pkg) => [`${getFullPackageName(pkg)}@${pkg.version}`, pkg])
    );

    const totalPackages = resolvedPackages.length;
    const limit = pLimit(DOWNLOAD_CONCURRENCY);
    let successCount = 0;
    let failCount = 0;
    let completedCount = 0;
    const failedPackages: FailedPackage[] = [];

    const downloadPromises = resolvedPackages.map((pkg) =>
      limit(async () => {
        if (isTaskCancelled(taskId)) {
          return;
        }

        const urlInfo: PackageUrlInfo = {
          ...pkg,
          url: resolvePackageUrl(pkg),
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
          url: resolvePackageUrl(pkg),
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

    const missing = findMissingPackages(taskDir, resolvedPackages);
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
