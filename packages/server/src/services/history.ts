import fs from "fs";
import path from "path";
import type { TaskType, TaskStatus, HistoryItem } from "@npm-downloader/types";
import { getDataDir } from "../config/dirs.js";

// Re-export types for backward compatibility
export type { TaskType, TaskStatus, HistoryItem };

const MAX_HISTORY = 50;
const history: HistoryItem[] = [];

/**
 * 获取历史记录文件路径
 */
const getHistoryFilePath = (): string => {
  const dataDir = getDataDir();
  return path.join(dataDir, "history.json");
};

// 确保目录存在
const ensureHistoryDir = () => {
  const filePath = getHistoryFilePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// 从文件加载历史记录
export const loadHistory = (): void => {
  try {
    ensureHistoryDir();
    const historyFile = getHistoryFilePath();
    if (fs.existsSync(historyFile)) {
      const data = fs.readFileSync(historyFile, "utf-8");
      const loaded: HistoryItem[] = JSON.parse(data);
      history.length = 0;
      history.push(...loaded.slice(0, MAX_HISTORY));
      console.log(`Loaded ${history.length} history items from disk`);
    }
  } catch (error) {
    console.error("Failed to load history from disk:", error);
  }
};

// 保存历史记录到文件（原子写入）
const saveHistory = (): void => {
  try {
    ensureHistoryDir();
    const historyFile = getHistoryFilePath();
    const tempFile = `${historyFile}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(history, null, 2), "utf-8");
    fs.renameSync(tempFile, historyFile);
  } catch (error) {
    console.error("Failed to save history to disk:", error);
  }
};

export const upsertHistoryItem = (
  taskId: string,
  patch: Omit<Partial<HistoryItem>, "taskId" | "createdAt"> & {
    type?: TaskType;
    createdAt?: number;
  }
): HistoryItem => {
  const now = Date.now();
  const idx = history.findIndex((h) => h.taskId === taskId);

  if (idx === -1) {
    const createdAt = patch.createdAt ?? now;
    const type = patch.type ?? "package";
    const status = patch.status ?? "pending";
    const item: HistoryItem = {
      taskId,
      type,
      status,
      message: patch.message,
      createdAt,
      updatedAt: now,
      zipUrl: patch.zipUrl,
      packageName: patch.packageName,
      packagesCount: patch.packagesCount,
      folderName: patch.folderName,
    };
    history.unshift(item);
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    saveHistory(); // 持久化到磁盘
    return item;
  }

  const existing = history[idx];
  const updated: HistoryItem = {
    ...existing,
    ...patch,
    taskId: existing.taskId,
    createdAt: existing.createdAt,
    updatedAt: now,
  };
  history[idx] = updated;
  saveHistory(); // 持久化到磁盘
  return updated;
};

export const listHistory = (): HistoryItem[] => {
  return [...history].sort((a, b) => b.createdAt - a.createdAt);
};

/**
 * 根据任务 ID 查找单条历史记录
 * 用于下载端点获取 folderName 等信息
 *
 * @param taskId 任务 ID
 * @returns 历史记录项，不存在则返回 undefined
 */
export const findHistoryItem = (taskId: string): HistoryItem | undefined => {
  return history.find((h) => h.taskId === taskId);
};

/**
 * 删除历史记录项
 * @param taskId 任务ID
 * @returns 是否删除成功
 */
export const deleteHistoryItem = (taskId: string): boolean => {
  const idx = history.findIndex((h) => h.taskId === taskId);
  if (idx === -1) {
    return false;
  }
  history.splice(idx, 1);
  saveHistory();
  return true;
};

/**
 * 清空所有历史记录
 * @returns 被清除的记录数量
 */
export const clearAllHistory = (): number => {
  const count = history.length;
  history.length = 0;
  saveHistory();
  return count;
};
