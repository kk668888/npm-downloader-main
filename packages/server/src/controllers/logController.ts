import type { Request, Response } from "express";
import { JsonController, Get, Param, Res } from "routing-controllers";
import { getTaskLogs } from "../services/taskLogger.js";
import { getTaskStatus } from "../services/taskStatus.js";
import { handleSSEConnection } from "../services/logStreamer.js";

@JsonController()
export class LogController {
  @Get("/logs/:taskId")
  getTaskLogs(
    @Param("taskId") taskId: string,
    @Res() res: Response
  ) {
    // 先检查任务是否存在
    const status = getTaskStatus(taskId);
    const logs = getTaskLogs(taskId);

    // 任务不存在且没有日志 → 404
    if (!status && logs.length === 0) {
      return res.status(404).json({ error: "Task not found" });
    }

    return res.json({ logs });
  }
}

// SSE 流端点（不使用 routing-controllers）
export const handleLogStream = (req: Request, res: Response): void => {
  handleSSEConnection(req, res);
};
