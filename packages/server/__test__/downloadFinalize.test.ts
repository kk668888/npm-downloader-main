import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildTgzFileName,
  decideFinalStatus,
  findMissingPackages,
  mergeMissingFailures,
} from "../src/utils/downloadFinalize.js";

/**
 * downloadFinalize 工具集单元测试。
 *
 * 这是 Task 4 的核心：覆盖
 *  - 文件名规则（scoped / 普通 / 合并形态）
 *  - 缺失文件校验（含大小为 0 的空文件场景）
 *  - failedPackages 合并（不可变 + 幂等）
 *  - 终态判定（completed / partial / failed）
 */
describe("buildTgzFileName", () => {
  it("scoped 包（拆分形态）：@types/node → types-node-20.1.0.tgz", () => {
    expect(
      buildTgzFileName({ scope: "@types", name: "node", version: "20.1.0" })
    ).toBe("types-node-20.1.0.tgz");
  });

  it("普通包：lodash@4.17.21 → lodash-4.17.21.tgz", () => {
    expect(
      buildTgzFileName({ name: "lodash", version: "4.17.21" })
    ).toBe("lodash-4.17.21.tgz");
  });

  it("scoped 包（合并形态 name 含 @）：@types/node → types-node-20.1.0.tgz", () => {
    expect(
      buildTgzFileName({ name: "@types/node", version: "20.1.0" })
    ).toBe("types-node-20.1.0.tgz");
  });

  it("与 core/downloader.ts 文件名规则一致（不冲突，文件能被找到）", () => {
    // 这个一致性是通过两侧共用同一规则保证的；这里仅断言本模块输出形态
    expect(
      buildTgzFileName({ scope: "@babel", name: "core", version: "7.0.0" })
    ).toBe("babel-core-7.0.0.tgz");
  });
});

describe("findMissingPackages", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "finalize-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("全部文件存在 → 返回空列表", () => {
    fs.writeFileSync(path.join(tempDir, "lodash-4.17.21.tgz"), "x");
    fs.writeFileSync(
      path.join(tempDir, "types-node-20.1.0.tgz"),
      "y"
    );
    const missing = findMissingPackages(tempDir, [
      { name: "lodash", version: "4.17.21" },
      { scope: "@types", name: "node", version: "20.1.0" },
    ]);
    expect(missing).toEqual([]);
  });

  it("缺失文件 → 返回缺失清单（含 scope 全名）", () => {
    fs.writeFileSync(path.join(tempDir, "lodash-4.17.21.tgz"), "x");
    const missing = findMissingPackages(tempDir, [
      { name: "lodash", version: "4.17.21" },
      { scope: "@types", name: "node", version: "20.1.0" },
    ]);
    expect(missing).toEqual([{ name: "@types/node", version: "20.1.0" }]);
  });

  it("大小为 0 的文件视为缺失（防止空文件混入）", () => {
    fs.writeFileSync(path.join(tempDir, "lodash-4.17.21.tgz"), "");
    const missing = findMissingPackages(tempDir, [
      { name: "lodash", version: "4.17.21" },
    ]);
    expect(missing).toEqual([{ name: "lodash", version: "4.17.21" }]);
  });
});

describe("mergeMissingFailures", () => {
  it("不可变：不修改原数组", () => {
    const existing = [
      { name: "lodash", version: "1.0.0", error: "HTTP 500" },
    ];
    const result = mergeMissingFailures(existing, [
      { name: "@types/node", version: "20.0.0" },
    ]);
    expect(existing).toHaveLength(1); // 原 entry 不变
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: "lodash", version: "1.0.0", error: "HTTP 500" });
    expect(result[1]).toEqual({
      name: "@types/node",
      version: "20.0.0",
      error: "missing after download",
    });
  });

  it("幂等：已存在（同 name+version）的不重复添加", () => {
    const existing = [
      { name: "lodash", version: "1.0.0", error: "HTTP 500" },
    ];
    const result = mergeMissingFailures(existing, [
      { name: "lodash", version: "1.0.0" }, // 已存在
      { name: "flaky", version: "2.0.0" }, // 新增
    ]);
    expect(result).toHaveLength(2);
    expect(result.find((f) => f.name === "lodash")?.error).toBe("HTTP 500"); // 保留原 error
    expect(result.find((f) => f.name === "flaky")?.error).toBe(
      "missing after download"
    );
  });
});

describe("decideFinalStatus", () => {
  it("无失败 → completed", () => {
    expect(decideFinalStatus(10, 10, [])).toBe("completed");
  });

  it("部分失败 → partial", () => {
    expect(
      decideFinalStatus(8, 10, [
        { name: "a", version: "1", error: "x" },
        { name: "b", version: "1", error: "y" },
      ])
    ).toBe("partial");
  });

  it("全部失败（成功数为 0）→ failed", () => {
    expect(
      decideFinalStatus(0, 3, [
        { name: "a", version: "1", error: "x" },
        { name: "b", version: "1", error: "y" },
        { name: "c", version: "1", error: "z" },
      ])
    ).toBe("failed");
  });

  it("总数为 0 → failed", () => {
    expect(decideFinalStatus(0, 0, [])).toBe("failed");
  });

  it("1 个成功 + 1 个失败 → partial（验证成功数大于 0 即为 partial）", () => {
    expect(
      decideFinalStatus(1, 2, [{ name: "a", version: "1", error: "x" }])
    ).toBe("partial");
  });
});
