import fs from "fs";
import path from "path";
import { TEMP_DIR } from "../middleware/dirs.js";
import { findHistoryItem } from "../services/history.js";
import { getTaskStatus } from "../services/taskStatus.js";
import { Controller, Get, Param, Res } from "routing-controllers";
import type { Response } from "express";

const sanitizeZipBaseName = (value: string): string => {
  return value.replace(/[\\/:*?"<>|]/g, "_").trim();
};

@Controller()
export class DownloadController {
  @Get("/download/:taskId")
  downloadZip(@Param("taskId") taskId: string, @Res() res: Response) {
    const historyItem = findHistoryItem(taskId);
    const zipBaseName = historyItem?.folderName
      ? sanitizeZipBaseName(historyItem.folderName) || taskId
      : taskId;
    const zipFileName = `${zipBaseName}.zip`;
    const zipPath = path.join(TEMP_DIR, zipFileName);

    if (fs.existsSync(zipPath)) {
      res.download(zipPath, zipFileName, (err) => {
        if (err) {
          console.error("Download error:", err);
          if (!res.headersSent) {
            res.status(500).json({ error: "Download failed" });
          }
        }
      });
      return;
    }
    res.status(404).json({ error: "File not found" });
  }

  @Get("/task/:taskId")
  getTask(@Param("taskId") taskId: string) {
    const status = getTaskStatus(taskId);
    if (status) return status;
    return { error: "Task not found" };
  }
}
