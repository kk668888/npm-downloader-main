import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("DownloadController", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "npm-downloader-test-"));
    process.env.TEMP_DIR = path.join(tempRoot, "temp");
    process.env.DATA_DIR = path.join(tempRoot, "data");
    fs.mkdirSync(process.env.TEMP_DIR, { recursive: true });
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.TEMP_DIR;
    delete process.env.DATA_DIR;
    fs.rmSync(tempRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("downloads zip by sanitized history folderName when taskId zip does not exist", async () => {
    const [{ DownloadController }, { upsertHistoryItem, clearAllHistory }] = await Promise.all([
      import("../src/controllers/downloadController.js"),
      import("../src/services/history.js"),
    ]);

    const taskId = "task-with-folder-name";
    const folderName = "release:bundle";
    const zipPath = path.join(process.env.TEMP_DIR!, "release_bundle.zip");
    fs.writeFileSync(zipPath, "zip-content");

    clearAllHistory();
    upsertHistoryItem(taskId, {
      type: "package",
      status: "completed",
      zipUrl: `/api/download/${taskId}`,
      folderName,
    });

    const download = vi.fn();
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));

    new DownloadController().downloadZip(taskId, { download, status } as never);

    expect(download).toHaveBeenCalledWith(zipPath, "release_bundle.zip", expect.any(Function));
    expect(status).not.toHaveBeenCalled();
  });
});
