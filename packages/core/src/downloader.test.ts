import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { downloadTgzFile } from "./downloader.js";
import type { PackageUrlInfo } from "./types.js";

/**
 * downloadTgzFile 加固后的单元测试
 *
 * 覆盖：
 * 1. 正常下载：写出生成正确文件名（含 scope / 普通包）
 * 2. HTTP 404：抛出错误，且不留半成品文件
 * 3. 写入中途异常：try/finally 清理半成品文件（核心 bug 修复点）
 * 4. 超时：fetch 被超时 abort → 抛出 → 清理
 */
const makeUrlInfo = (
  overrides: Partial<PackageUrlInfo>
): PackageUrlInfo => ({
  name: "lodash",
  version: "4.17.21",
  url: "https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz",
  ...overrides,
});

const makeResponse = (
  body: Buffer,
  init: { status?: number; headers?: Record<string, string> } = {}
): Response => {
  const status = init.status ?? 200;
  const headers = new Headers({
    "Content-Type": "application/octet-stream",
    ...init.headers,
  });
  // 用 ReadableStream 包装 Buffer
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(body);
      controller.close();
    },
  });
  return new Response(stream, { status, headers });
};

describe("downloadTgzFile", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "core-downloader-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("正常下载：普通包 → 写出 name-version.tgz", async () => {
    const payload = Buffer.from("hello-tarball");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        makeResponse(payload, {
          headers: { "Content-Length": String(payload.length) },
        })
      )
    );

    const urlInfo = makeUrlInfo({ name: "lodash", version: "4.17.21" });
    await downloadTgzFile(urlInfo, tempDir);

    const filePath = path.join(tempDir, "lodash-4.17.21.tgz");
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath)).toEqual(payload);
  });

  it("正常下载：scoped 包 → 写出 scope-name-version.tgz", async () => {
    const payload = Buffer.from("scoped-tarball");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        makeResponse(payload, {
          headers: { "Content-Length": String(payload.length) },
        })
      )
    );

    const urlInfo = makeUrlInfo({
      scope: "@types",
      name: "node",
      version: "20.1.0",
    });
    await downloadTgzFile(urlInfo, tempDir);

    const filePath = path.join(tempDir, "types-node-20.1.0.tgz");
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath)).toEqual(payload);
  });

  it("HTTP 404：抛出错误且不残留半成品文件", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => makeResponse(Buffer.from(""), { status: 404 }))
    );

    const urlInfo = makeUrlInfo({ name: "ghost-pkg", version: "0.0.1" });
    await expect(downloadTgzFile(urlInfo, tempDir)).rejects.toThrow(/404/);

    const filePath = path.join(tempDir, "ghost-pkg-0.0.1.tgz");
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it("写入中途抛错：清理半成品文件（核心 bug 修复验证）", async () => {
    // 构造一个会在消费 body 中途抛错的 Response
    const brokenStream = new ReadableStream({
      start(controller) {
        controller.enqueue(Buffer.from("partial-data"));
        // 模拟流读取中途失败
        controller.error(new Error("connection reset mid-stream"));
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(brokenStream, {
          status: 200,
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Length": "1024",
          },
        })
      )
    );

    const urlInfo = makeUrlInfo({ name: "flaky", version: "1.0.0" });
    await expect(downloadTgzFile(urlInfo, tempDir)).rejects.toThrow();

    // 关键断言：半成品文件必须被清理
    const filePath = path.join(tempDir, "flaky-1.0.0.tgz");
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it("fetch 超时（AbortError）：抛出且清理", async () => {
    // 用真实的 AbortSignal.timeout(1) 触发 abort
    const originalFetch = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        // 使用传入的 signal 立即超时
        const signal = init?.signal;
        if (signal) {
          // 立即触发 abort（模拟超时）
          return new Promise<Response>((_resolve, reject) => {
            const e = new Error("The operation was aborted");
            e.name = "AbortError";
            // 下一 tick 抛出
            setTimeout(() => reject(e), 0);
          });
        }
        return originalFetch(_url, init);
      })
    );

    const urlInfo = makeUrlInfo({ name: "timeout-pkg", version: "2.0.0" });
    await expect(downloadTgzFile(urlInfo, tempDir)).rejects.toThrow();

    const filePath = path.join(tempDir, "timeout-pkg-2.0.0.tgz");
    expect(fs.existsSync(filePath)).toBe(false);
  });
});
