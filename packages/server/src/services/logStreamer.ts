import type { Request, Response } from "express";
import type { TaskLog } from "@npm-downloader/types";
import { getTaskStatus, type TaskStatus } from "./taskStatus.js";
import { getTaskLogs } from "./taskLogger.js";

// SSE 客户端连接管理
interface SSEClient {
  taskId: string;
  response: Response;
  isAlive: boolean;
}

const activeClients = new Map<string, SSEClient[]>();

/**
 * 设置 SSE 响应头
 */
const setupSSEHeaders = (req: Request, res: Response): void => {
  // CORS headers for SSE
  const origin = req.headers.origin || '*';
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
};

/**
 * 发送 SSE 事件
 */
const sendSSEEvent = (res: Response, data: unknown, event?: string): void => {
  try {
    if (event) {
      res.write(`event: ${event}\n`);
    }
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (error) {
    // 客户端可能已断开
    console.error("Failed to send SSE event:", error);
  }
};

/**
 * 发送心跳保活
 */
const sendHeartbeat = (res: Response): void => {
  try {
    res.write(": heartbeat\n\n");
  } catch (error) {
    // 客户端可能已断开
  }
};

/**
 * 处理 SSE 连接
 */
export const handleSSEConnection = (req: Request, res: Response): void => {
  const taskId = req.params.taskId as string;

  // 检查任务是否存在
  const status = getTaskStatus(taskId);
  if (!status) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  setupSSEHeaders(req, res);

  // 创建客户端
  const client: SSEClient = {
    taskId,
    response: res,
    isAlive: true,
  };

  // 添加到活跃客户端列表
  if (!activeClients.has(taskId)) {
    activeClients.set(taskId, []);
  }
  activeClients.get(taskId)!.push(client);

  // 发送历史日志
  const historyLogs = getTaskLogs(taskId);
  if (historyLogs.length > 0) {
    sendSSEEvent(res, { logs: historyLogs }, "history");
  }

  // 发送初始状态
  if (status) {
    sendSSEEvent(res, status, "status");
  }

  // 清理函数
  const cleanup = () => {
    client.isAlive = false;
    const clients = activeClients.get(taskId);
    if (clients) {
      const index = clients.indexOf(client);
      if (index > -1) {
        clients.splice(index, 1);
      }
      if (clients.length === 0) {
        activeClients.delete(taskId);
      }
    }
  };

  // 监听客户端断开
  req.on("close", cleanup);
  res.on("close", cleanup);
  res.on("error", cleanup);

  // 心跳保活（每 15 秒）
  const heartbeatInterval = setInterval(() => {
    if (client.isAlive) {
      sendHeartbeat(res);
    } else {
      clearInterval(heartbeatInterval);
    }
  }, 15000);

  // 检查任务状态，如果已完成则发送完成事件
  const checkInterval = setInterval(() => {
    if (!client.isAlive) {
      clearInterval(checkInterval);
      clearInterval(heartbeatInterval);
      return;
    }

    const currentStatus = getTaskStatus(taskId);
    if (currentStatus && (currentStatus.status === "completed" || currentStatus.status === "failed")) {
      // 任务完成，发送最终状态后关闭连接
      sendSSEEvent(res, { done: true, status: currentStatus }, "end");
      setTimeout(() => {
        res.end();
        cleanup();
      }, 1000);
      clearInterval(checkInterval);
      clearInterval(heartbeatInterval);
    }
  }, 1000);
};

/**
 * 广播日志到所有订阅该任务的客户端
 */
export const broadcastLog = (log: TaskLog): void => {
  const clients = activeClients.get(log.taskId);
  if (!clients || clients.length === 0) return;

  // 移除已断开的客户端
  for (let i = clients.length - 1; i >= 0; i--) {
    if (!clients[i].isAlive) {
      clients.splice(i, 1);
    }
  }

  // 发送日志到所有活跃客户端
  clients.forEach((client) => {
    if (client.isAlive) {
      sendSSEEvent(client.response, log, "log");
    }
  });
};

/**
 * 广播状态更新到所有订阅该任务的客户端
 */
export const broadcastStatus = (taskId: string, status: TaskStatus): void => {
  const clients = activeClients.get(taskId);
  if (!clients || clients.length === 0) return;

  clients.forEach((client) => {
    if (client.isAlive) {
      sendSSEEvent(client.response, status, "status");
    }
  });
};

/**
 * 获取活跃连接数
 */
export const getActiveConnectionCount = (taskId?: string): number => {
  if (taskId) {
    return activeClients.get(taskId)?.length || 0;
  }
  let total = 0;
  for (const clients of activeClients.values()) {
    total += clients.length;
  }
  return total;
};
