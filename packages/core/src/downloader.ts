import path from "path";
import fs from "fs";
import { pipeline } from "stream/promises";
import type { PackageUrlInfo } from "./types.js";
import { logger } from "./logger.js";

export const downloadTgzFile = async (
  urlInfo: PackageUrlInfo,
  downloadPath: string
): Promise<void> => {
  let downloadedBytes = 0;
  const response = await fetch(urlInfo.url);
  // 生成文件名：作用域包用 scope-name-version.tgz，普通包用 name-version.tgz
  const fileName = urlInfo.scope
    ? `${urlInfo.scope.substring(1)}-${urlInfo.name}-${urlInfo.version}.tgz`
    : `${urlInfo.name}-${urlInfo.version}.tgz`;
  const filePath = path.resolve(downloadPath, fileName);

  if (!response.ok) {
    const errorInfo = `HTTP 错误！URL:${response.url},状态码：${response.status}`;
    logger.error(errorInfo);
    throw new Error(errorInfo);
  }
  if (!response.body) {
    logger.error(`${urlInfo.name}:${urlInfo.version} 下载内容为空`);
    return Promise.reject("下载内容为空");
  }
  const totalBytesStr = response.headers.get("content-length");
  if (!totalBytesStr) {
    console.warn("警告: 响应头中没有 Content-Length，无法计算下载进度。");
    // 在这种情况下，你仍然可以下载文件，但无法显示进度百分比
    // 这里我们选择直接写入文件并退出
    const fileHandle = await fs.promises.open(filePath, "w");
    const fileWriteStream = fileHandle.createWriteStream();
    await pipeline(response.body, fileWriteStream);
    await fileHandle.close();
    console.log("文件下载完成（无进度）。");
    return;
  }
  const totalBytes = parseInt(totalBytesStr, 10);

  const fileHandle = await fs.promises.open(filePath, "w");
  const fileWriteStream = fileHandle.createWriteStream();

  console.log(`文件总大小: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);

  // 4. 使用 for await...of 循环处理 response.body (ReadableStream)
  for await (const chunk of response.body) {
    // 写入文件
    fileWriteStream.write(chunk);

    // 更新已下载字节数
    downloadedBytes += chunk.length;

    // 计算并显示进度
    const percentage = ((downloadedBytes / totalBytes) * 100).toFixed(2);
    // 使用 \r 回车符让光标回到行首，实现单行刷新进度条
    process.stdout.write(
      `\r下载进度: ${percentage}% (${(downloadedBytes / 1024 / 1024).toFixed(
        2
      )} MB)`
    );
  }

  // 确保所有内容写入完毕并关闭文件
  fileWriteStream.end();
  await new Promise<void>((resolve) => fileWriteStream.on("finish", resolve));
  await fileHandle.close();

  console.log("\n文件下载并保存成功!");
};
