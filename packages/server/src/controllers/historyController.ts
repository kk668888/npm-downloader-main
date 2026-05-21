import { JsonController, Get, Delete, Param, HttpCode, OnUndefined } from "routing-controllers";
import { listHistory, deleteHistoryItem, clearAllHistory } from "../services/history.js";

@JsonController()
export class HistoryController {
  @Get("/history")
  getHistory() {
    return { items: listHistory() };
  }

  @Delete("/history/:taskId")
  @HttpCode(204)
  @OnUndefined(204)
  deleteHistory(@Param("taskId") taskId: string) {
    const success = deleteHistoryItem(taskId);
    if (!success) {
      throw new Error("History item not found");
    }
    return;
  }

  /**
   * 清空所有历史记录
   * DELETE /api/history
   */
  @Delete("/history")
  @HttpCode(200)
  clearHistory() {
    const count = clearAllHistory();
    return { ok: true, deletedCount: count };
  }
}
