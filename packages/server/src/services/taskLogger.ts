import fs from "fs";
import path from "path";
import type { TaskLog } from "@npm-downloader/types";
import { getDataDir } from "../config/dirs.js";

// Re-export type for backward compatibility
export type { TaskLog };

const taskLogs = new Map<string, TaskLog[]>();
const MAX_LOGS_PER_TASK = 100;

/**
 * 获取日志文件目录
 */
const getLogsDir = (): string => {
  const dataDir = getDataDir();
  return path.join(dataDir, "logs");
};

// 确保日志目录存在
const ensureLogsDir = () => {
  const logsDir = getLogsDir();
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
};

// 获取日志文件路径
const getLogFilePath = (taskId: string): string => {
  return path.join(getLogsDir(), `${taskId}.log`);
};

// 追加日志到文件
const appendLogToFile = (taskId: string, log: TaskLog): void => {
  try {
    ensureLogsDir();
    const logFile = getLogFilePath(taskId);
    const logLine = JSON.stringify(log) + "\n";
    fs.appendFileSync(logFile, logLine, "utf-8");
  } catch (error) {
    console.error(`Failed to write log to file for task ${taskId}:`, error);
  }
};

// 从文件加载日志
const loadLogsFromFile = (taskId: string): TaskLog[] => {
  try {
    const logFile = getLogFilePath(taskId);
    if (!fs.existsSync(logFile)) {
      return [];
    }
    const content = fs.readFileSync(logFile, "utf-8");
    const lines = content
      .trim()
      .split("\n")
      .filter((line) => line);
    return lines.map((line) => JSON.parse(line));
  } catch (error) {
    console.error(`Failed to load logs from file for task ${taskId}:`, error);
    return [];
  }
};

export const addTaskLog = (
  taskId: string,
  level: TaskLog["level"],
  message: string
): void => {
  const log: TaskLog = { taskId, timestamp: Date.now(), level, message };

  // 写入文件
  appendLogToFile(taskId, log);

  // 同时保存到内存（用于快速读取）
  if (!taskLogs.has(taskId)) {
    taskLogs.set(taskId, []);
  }
  const logs = taskLogs.get(taskId)!;
  logs.push(log);
  if (logs.length > MAX_LOGS_PER_TASK) {
    logs.shift();
  }

  // 广播到 SSE 客户端（延迟导入避免循环依赖）
  try {
    const { broadcastLog } = require("./logStreamer.js");
    broadcastLog(log);
  } catch (error) {
    // 忽略广播错误
  }
};

export const getTaskLogs = (taskId: string): TaskLog[] => {
  // 优先从内存读取
  if (taskLogs.has(taskId)) {
    return taskLogs.get(taskId)!;
  }

  // 如果内存中没有，尝试从文件加载
  const logsFromFile = loadLogsFromFile(taskId);
  if (logsFromFile.length > 0) {
    taskLogs.set(taskId, logsFromFile);
    return logsFromFile;
  }

  return [];
};

export const clearTaskLogs = (taskId: string): void => {
  taskLogs.delete(taskId);
};
