import path from "path";
import { fileURLToPath } from "url";

// 获取当前文件所在目录（编译后的 dist/config）
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server 包的根目录：从 dist/config 向上两级到 server 包根目录
// 运行时路径为: packages/server/dist/config/dirs.js
// SERVER_ROOT 应该指向: packages/server
const SERVER_ROOT = path.resolve(__dirname, "../..");

/**
 * 获取配置的上传目录
 * 优先级：环境变量 > 默认值（相对于 server 包）
 */
export const getUploadDir = (): string => {
  const envDir = process.env.UPLOAD_DIR;
  if (envDir) {
    return path.resolve(envDir);
  }
  // 默认：server 包目录下的 uploads
  return path.resolve(SERVER_ROOT, "uploads");
};

/**
 * 获取配置的临时目录
 * 优先级：环境变量 > 默认值（相对于 server 包）
 */
export const getTempDir = (): string => {
  const envDir = process.env.TEMP_DIR;
  if (envDir) {
    return path.resolve(envDir);
  }
  // 默认：server 包目录下的 temp
  return path.resolve(SERVER_ROOT, "temp");
};

/**
 * 获取数据目录（历史记录、日志等）
 * 优先级：环境变量 > 默认值（相对于 server 包）
 */
export const getDataDir = (): string => {
  const envDir = process.env.DATA_DIR;
  if (envDir) {
    return path.resolve(envDir);
  }
  // 默认：server 包目录下的 data
  return path.resolve(SERVER_ROOT, "data");
};
