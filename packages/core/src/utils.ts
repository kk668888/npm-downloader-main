import { existsSync, mkdirSync, rmSync, statSync } from "fs";
import { dirname, resolve } from "path";
import { logger } from "./logger.js";
/**
 * 确保需要下载pnpm-lock.yaml文件存在。
 *
 * @param path - lock文件所在目录路径。
 */
export interface LockfileLocation {
  dir: string;
  file: string;
}

export const ensureLockFile = (
  lockFilePathOrDir?: string
): LockfileLocation => {
  const targetPath = lockFilePathOrDir
    ? resolve(lockFilePathOrDir)
    : process.cwd();

  let lockfileDir = targetPath;
  let lockfilePath = targetPath;

  try {
    const stats = statSync(targetPath);
    if (stats.isDirectory()) {
      lockfileDir = targetPath;
      lockfilePath = resolve(targetPath, "pnpm-lock.yaml");
    } else {
      lockfileDir = dirname(targetPath);
      lockfilePath = targetPath;
    }
  } catch {
    if (targetPath.endsWith("pnpm-lock.yaml")) {
      lockfileDir = dirname(targetPath);
      lockfilePath = targetPath;
    } else {
      lockfileDir = targetPath;
      lockfilePath = resolve(targetPath, "pnpm-lock.yaml");
    }
  }

  if (!existsSync(lockfilePath)) {
    logger.error(`lock文件不存在: ${lockfilePath}`);
    throw Error("lock文件不存在，退出执行。");
  }

  return { dir: lockfileDir, file: lockfilePath };
};
/**
 * 确保指定的下载路径存在，如果不存在则创建该目录。
 *
 * @param path - 需要检查或创建的文件系统路径。
 */
export const ensureDownloadPath = (path: string): void => {
  if (!existsSync(path)) {
    mkdirSync(path);
  }
};

/**
 * 异步清空指定的下载路径，删除其中的所有文件和目录。
 *
 * @param path - 要清空的文件系统路径。
 * @returns 当路径被清空后返回一个已解决的 Promise。
 * @throws 如果删除操作失败，将抛出错误。
 */
export const clearDownloadPath = async (path: string): Promise<void> => {
  try {
    await rmSync(path, { recursive: true, force: true });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error({ err }, "Error clearing download path");
    throw err;
  }
};
