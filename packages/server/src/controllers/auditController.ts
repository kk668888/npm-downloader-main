import { Controller, Get, Param } from "routing-controllers";
import { getTaskStatus } from "../services/taskStatus.js";

@Controller("/task")
export class AuditController {
  /**
   * 获取任务的审计报告
   * GET /api/task/:taskId/audit
   */
  @Get("/:taskId/audit")
  getAuditReport(@Param("taskId") taskId: string) {
    const status = getTaskStatus(taskId);
    if (!status) {
      return { auditReport: null };
    }
    return { auditReport: status.auditReport || null };
  }
}
