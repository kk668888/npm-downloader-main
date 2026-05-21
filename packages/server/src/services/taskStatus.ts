import crypto from "crypto";
import { upsertHistoryItem } from "./history.js";
import type { TaskStatus, ProgressInfo, AuditReport } from "@npm-downloader/types";

// Re-export type for backward compatibility
export type { TaskStatus, ProgressInfo };

export interface TaskStatusItem {
  status: TaskStatus;
  message?: string;
  progress?: ProgressInfo;
  auditReport?: AuditReport;
  /** 任务令牌，用于审计确认等敏感操作的防伪造校验 */
  token: string;
}

const taskStatus = new Map<string, TaskStatusItem>();

/**
 * 设置任务状态
 *
 * 首次创建时自动生成 token（crypto.randomUUID），
 * 后续更新保留已有 token。
 */
export const setTaskStatus = (
  taskId: string,
  status: TaskStatus,
  message?: string,
  progress?: ProgressInfo,
  auditReport?: AuditReport
): void => {
  const existing = taskStatus.get(taskId);
  const item: TaskStatusItem = {
    status,
    message,
    progress,
    auditReport: auditReport ?? existing?.auditReport,
    // 首次创建生成 token，后续更新保留
    token: existing?.token ?? crypto.randomUUID(),
  };
  taskStatus.set(taskId, item);
  // 同步审计报告到 history（持久化）
  const historyPatch: Parameters<typeof upsertHistoryItem>[1] = { status, message, progress };
  if (item.auditReport) {
    historyPatch.auditReport = item.auditReport;
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
