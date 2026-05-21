import fs from "fs";
import { getUploadDir, getTempDir } from "../config/dirs.js";

// 运行时计算目录路径
export const UPLOAD_DIR = getUploadDir();
export const TEMP_DIR = getTempDir();

/**
 * 确保工作目录存在，如果不存在则创建
 */
export const ensureWorkingDirs = (): void => {
  const dirs = [
    { path: UPLOAD_DIR, name: "Upload" },
    { path: TEMP_DIR, name: "Temp" },
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir.path)) {
      fs.mkdirSync(dir.path, { recursive: true });
      console.log(`Created ${dir.name} directory: ${dir.path}`);
    }
  }
};
