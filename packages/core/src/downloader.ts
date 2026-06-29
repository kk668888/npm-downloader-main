import path from "path";
import fs from "fs";
import { pipeline } from "stream/promises";
import { Transform } from "stream";
import type { PackageUrlInfo } from "./types.js";
import { logger } from "./logger.js";

/**
 * 单个 tarball 下载的超时时间（毫秒）。
 *
 * 30 秒覆盖大多数 npm registry 响应；超过则 abort，
 * 由上层 retryWithBackoff 决定是否重试。
 */
export const DOWNLOAD_TIMEOUT_MS = 30000;

/**
 * 根据 PackageUrlInfo 推导落盘文件名。
 *
 * 规则（与 controllers 中的校验逻辑严格一致）：
 * - scoped 包（scope 存在，形如 "@types"）→ `${scope 去掉 @}-${name}-${version}.tgz`
 *   例如 @types/node@20.1.0 → types-node-20.1.0.tgz
 * - 普通包 → `${name}-${version}.tgz`
 *
 * 抽出为独立函数，便于单测和与 server 端校验逻辑共享同一规则。
 *
 * @param urlInfo 包 URL 信息（含 scope / name / version）
 * @returns tarball 文件名
 */
export function buildTgzFileName(urlInfo: Pick<PackageUrlInfo, "scope" | "name" | "version">): string {
  return urlInfo.scope
    ? `${urlInfo.scope.substring(1)}-${urlInfo.name}-${urlInfo.version}.tgz`
    : `${urlInfo.name}-${urlInfo.version}.tgz`;
}

/**
 * 下载单个 npm tarball 到指定目录。
 *
 * 加固点（修复"ZIP 包缺失"根因）：
 * 1. 超时：fetch 使用 `AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)`，避免长时间挂起。
 * 2. Backpressure：使用 `stream.promises.pipeline` 统一处理可读流→可写流的背压，
 *    替换原本忽略 write 返回值的 for-await 写法，防止内存暴涨 / 流截断。
 * 3. 清理：try/finally 任何异常路径下都用 `fs.rmSync(filePath, { force: true })`
 *    删除半成品 tgz，避免损坏文件被混入最终 ZIP。
 * 4. 进度：通过 Transform 流统计已写入字节数，输出进度日志。
 *
 * 【安全说明：SSRF 信任模型】
 * 本函数会 `fetch(urlInfo.url)`，而该 URL 来自用户上传的 pnpm-lock.yaml 的
 * `resolution.tarball`（完全由 lockfile 决定）。在当前信任模型下——用户主动
 * 上传自己的 lockfile 做离线下载、操作者即受益人——SSRF（Server-Side Request
 * Forgery）风险可接受。
 *
 * 若未来将该服务开放给不可信用户，需在发起请求前增加下述防护：
 * - 协议白名单：仅允许 `https:`（必要时可放宽到 `http:`）。
 * - 拒绝私有 / 回环 / 链路本地 IP 段：127.0.0.0/8、10.0.0.0/8、172.16.0.0/12、
 *   192.168.0.0/16、169.254.0.0/16、::1、fc00::/7 等。
 * - 拒绝 IP 字面量 hostname（如 `http://169.254.169.254/`），强制要求合法域名。
 * - 对解析出的目标 IP 与重定向后的 Location 一并校验，防止 DNS Rebinding。
 *
 * @param urlInfo 包 URL 信息
 * @param downloadPath 落盘目录（需已存在）
 * @throws HTTP 错误 / 超时 / 网络错误 / 流错误
 */
export const downloadTgzFile = async (
  urlInfo: PackageUrlInfo,
  downloadPath: string
): Promise<void> => {
  // 1. 计算最终文件路径
  const fileName = buildTgzFileName(urlInfo);
  const filePath = path.resolve(downloadPath, fileName);

  // 用于在 finally 中判断是否需要清理：只要开始写文件，失败就要清
  let fileOpened = false;

  try {
    // 2. 发起请求（带超时）—— AbortSignal.timeout 在超时后自动 abort fetch
    const response = await fetch(urlInfo.url, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });

    // 3. 非 2xx 直接抛错（交由上层重试逻辑判断是否可重试）
    if (!response.ok) {
      const errorInfo = `HTTP 错误！URL:${response.url},状态码：${response.status}`;
      logger.error(errorInfo);
      throw new Error(errorInfo);
    }
    if (!response.body) {
      // body 为空也视为错误，抛出（保持异常路径统一清理）
      const emptyErr = `${urlInfo.name}:${urlInfo.url} 下载内容为空`;
      logger.error(emptyErr);
      throw new Error(emptyErr);
    }

    // 4. 打开目标文件（创建 / 截断）
    const fileHandle = await fs.promises.open(filePath, "w");
    fileOpened = true;
    const fileWriteStream = fileHandle.createWriteStream();

    try {
      // 5. 准备进度统计：用 Transform 流在管道中间计数 chunk 大小
      const totalBytesStr = response.headers.get("content-length");
      const totalBytes = totalBytesStr ? parseInt(totalBytesStr, 10) : null;

      let downloadedBytes = 0;
      // 进度计数 Transform：透传 chunk，同时累加字节数并打日志
      const progressCounter = new Transform({
        transform(chunk, _encoding, callback) {
          downloadedBytes += chunk.length;
          if (totalBytes) {
            const percentage = ((downloadedBytes / totalBytes) * 100).toFixed(2);
            logger.info(
              `${fileName} 下载进度: ${percentage}% (${(downloadedBytes / 1024 / 1024).toFixed(2)} MB)`
            );
          } else {
            logger.info(
              `${fileName} 已下载: ${(downloadedBytes / 1024 / 1024).toFixed(2)} MB`
            );
          }
          callback(null, chunk);
        },
      });

      // 6. pipeline 自动处理 backpressure + 错误传播 + 流关闭
      //    任何一段失败都会 reject，并在 reject 前 destroy 各流
      await pipeline(response.body, progressCounter, fileWriteStream);
    } finally {
      // 无论成功失败都关闭文件句柄（pipeline 已处理流的 destroy）
      await fileHandle.close().catch((err: unknown) => {
        // 关闭失败仅记录，不掩盖原始错误
        logger.error(`${fileName} 关闭文件句柄失败: ${String(err)}`);
      });
    }
  } catch (error) {
    // 任何异常路径：清理半成品文件，避免损坏 tgz 混入 ZIP
    if (fileOpened) {
      try {
        fs.rmSync(filePath, { force: true });
      } catch {
        // 清理失败不影响原始错误抛出
      }
    }
    throw error;
  }
};
