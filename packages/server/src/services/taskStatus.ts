import crypto from "crypto";
import { upsertHistoryItem } from "./history.js";
import type { TaskStatus, ProgressInfo, AuditReport, FailedPackage } from "@npm-downloader/types";

// Re-export type for backward compatibility
export type { TaskStatus, ProgressInfo };

export interface TaskStatusItem {
  status: TaskStatus;
  message?: string;
  progress?: ProgressInfo;
  auditReport?: AuditReport;
  /** 任务令牌，用于审计确认等敏感操作的防伪造校验 */
  token: string;
  /** 用户自定义的文件夹名称（用于 ZIP 下载时的文件名） */
  folderName?: string;
  /** 下载失败的包列表（partial / failed 时可能有值），供前端轮询读取 */
  failedPackages?: FailedPackage[];
}

const taskStatus = new Map<string, TaskStatusItem>();

/**
 * 设置任务状态
 *
 * 首次创建时自动生成 token（crypto.randomUUID），
 * 后续更新保留已有 token。
 *
 * @param taskId 任务 ID
 * @param status 任务状态
 * @param message 状态描述
 * @param progress 进度信息
 * @param auditReport 安全审计报告（首次设置后保留）
 * @param folderName 用户自定义文件夹名（首次设置后保留）
 * @param failedPackages 下载失败包清单（仅在终态 completed/partial/failed 时传入；
 *        传入 undefined 则保留已有值，传入空数组表示清空）
 */
export const setTaskStatus = (
  taskId: string,
  status: TaskStatus,
  message?: string,
  progress?: ProgressInfo,
  auditReport?: AuditReport,
  folderName?: string,
  failedPackages?: FailedPackage[]
): void => {
  const existing = taskStatus.get(taskId);
  const item: TaskStatusItem = {
    status,
    message,
    progress,
    auditReport: auditReport ?? existing?.auditReport,
    // 首次创建生成 token，后续更新保留
    token: existing?.token ?? crypto.randomUUID(),
    // folderName：显式传入 > 已有值 > undefined
    folderName: folderName ?? existing?.folderName,
    // failedPackages：显式传入（含空数组）覆盖；否则保留已有
    failedPackages: failedPackages ?? existing?.failedPackages,
  };
  taskStatus.set(taskId, item);
  // 同步审计报告到 history（持久化）
  const historyPatch: Parameters<typeof upsertHistoryItem>[1] = { status, message, progress };
  if (item.auditReport) {
    historyPatch.auditReport = item.auditReport;
  }
  if (item.failedPackages) {
    historyPatch.failedPackages = item.failedPackages;
  }
  upsertHistoryItem(taskId, historyPatch);
};

export const getTaskStatus = (taskId: string): TaskStatusItem | undefined => {
  return taskStatus.get(taskId);
};

/**
 * 校验任务令牌是否匹配
 * 用于防止审计确认接口被伪造调用
 */
export function validateTaskToken(taskId: string, token: string): boolean {
  const item = taskStatus.get(taskId);
  if (!item) return false;
  return item.token === token;
}

// ========================================
// 审计确认机制 — 基于 Promise 的内存 Map
// ========================================

/** 确认等待超时时间（15 分钟） */
const CONFIRMATION_TIMEOUT = 15 * 60 * 1000;

interface AuditConfirmationEntry {
  /** Promise resolve 函数 */
  resolve: () => void;
  /** 超时定时器 */
  timer: NodeJS.Timeout;
}

/** 等待用户确认的 Promise 解析函数 */
const auditConfirmations = new Map<string, AuditConfirmationEntry>();

/**
 * 等待用户确认审计报告（阻塞当前任务直到用户确认）
 *
 * 增加 15 分钟超时保护：超时后自动清理并抛出
 * AUDIT_CONFIRMATION_TIMEOUT 错误，由控制器 catch 并标记任务失败。
 */
export function waitForAuditConfirmation(taskId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      auditConfirmations.delete(taskId);
      reject(new Error("AUDIT_CONFIRMATION_TIMEOUT"));
    }, CONFIRMATION_TIMEOUT);

    auditConfirmations.set(taskId, { resolve, timer });
  });
}

/**
 * 用户确认审计报告（由 auditController 调用）
 * 触发对应的 Promise resolve，控制器继续下载流程
 */
export function confirmAudit(taskId: string): boolean {
  const entry = auditConfirmations.get(taskId);
  if (entry) {
    clearTimeout(entry.timer);
    entry.resolve();
    auditConfirmations.delete(taskId);
    return true;
  }
  return false;
}

/**
 * 清理审计确认（任务取消或失败时调用）
 * 同时清理超时定时器，防止内存泄漏
 */
export function clearAuditConfirmation(taskId: string): void {
  const entry = auditConfirmations.get(taskId);
  if (entry) {
    clearTimeout(entry.timer);
  }
  auditConfirmations.delete(taskId);
}

// ========================================
// 任务取消机制 — 基于 AbortController
// ========================================

/** 每个任务对应的 AbortController，用于取消正在进行的下载操作 */
const taskAbortControllers = new Map<string, AbortController>();

/**
 * 为任务创建 AbortController
 * 在下载循环中通过 signal.aborted 判断任务是否被取消
 *
 * @param taskId 任务 ID
 * @returns 创建的 AbortController 实例
 */
export function createTaskAbortController(taskId: string): AbortController {
  const controller = new AbortController();
  taskAbortControllers.set(taskId, controller);
  return controller;
}

/**
 * 取消指定任务
 * 会 abort 该任务的所有下载操作，设置状态为 "cancelled"，并同步到历史记录
 *
 * @param taskId 任务 ID
 * @returns 是否成功取消（任务存在且未完成时返回 true）
 */
export function cancelTask(taskId: string): boolean {
  const controller = taskAbortControllers.get(taskId);
  if (controller) {
    controller.abort();
    // setTaskStatus 内部会调用 upsertHistoryItem，无需重复调用
    setTaskStatus(taskId, "cancelled", "任务已取消");
    clearAuditConfirmation(taskId);
    return true;
  }
  return false;
}

/**
 * 检查任务是否已被取消
 * 在下载循环的每个包下载前调用，实现快速退出
 *
 * @param taskId 任务 ID
 * @returns 任务是否已被取消
 */
export function isTaskCancelled(taskId: string): boolean {
  return taskAbortControllers.get(taskId)?.signal.aborted ?? false;
}

/**
 * 任务完成后清理对应的 AbortController，释放内存
 * 在任务完成、失败或取消后的 finally 块中调用
 *
 * @param taskId 任务 ID
 */
export function removeTaskAbortController(taskId: string): void {
  taskAbortControllers.delete(taskId);
}
