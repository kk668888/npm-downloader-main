import fs from "fs";
import path from "path";
import { TEMP_DIR } from "../middleware/dirs.js";
import { getTaskStatus } from "../services/taskStatus.js";
import { Controller, Get, Param, Res } from "routing-controllers";
import type { Response } from "express";

@Controller()
export class DownloadController {
  @Get("/download/:taskId")
  downloadZip(@Param("taskId") taskId: string, @Res() res: Response) {
    const zipPath = path.join(TEMP_DIR, `${taskId}.zip`);
    if (fs.existsSync(zipPath)) {
      res.download(zipPath, (err) => {
        if (err) {
          console.error("Download error:", err);
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
