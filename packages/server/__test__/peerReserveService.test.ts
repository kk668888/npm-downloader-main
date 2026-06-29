/**
 * peerReserveService 单元测试 —— Phase 2
 *
 * 全部 mock pacote.manifest，**不真联网**。
 *
 * 覆盖用例：
 *   ① installed 候选被跳过
 *   ② 未装候选递归收集根 peer + 传递依赖
 *   ③ existingSpecs 去重（lockfile 已有的 name@version 不重复收集）
 *   ④ 同包多 range 各解析（range 内最新版）
 *   ⑤ 单个 manifest reject 被记录到 skipped 且不中断整体
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// 必须在 import service 之前 mock pacote，确保 service 内部拿到的 pacote 是 mock 版本。
// vi.mock 的工厂返回值会替换整个 "pacote" 模块的默认导出。
vi.mock("pacote", () => ({
  default: {
    // manifest 的实现由每个用例通过 manifestMock 重新赋值，
    // 这里先给一个默认 reject，避免未设置的用例误触真联网。
    manifest: vi.fn(async (_spec: string): Promise<unknown> => {
      throw new Error("pacote.manifest not configured for this test");
    }),
  },
}));

// 在 mock 之后导入 —— 这样 service 内部 `import pacote from "pacote"` 拿到的是 mock。
// 注意：service 用 ESM 默认导入，对应 mock 工厂返回的 `{ default: { manifest } }`。
import pacote from "pacote";
import {
  resolvePeerReserve,
  type ResolvePeerReserveOptions,
} from "../src/services/peerReserveService.js";
import type { PeerReserveCandidate } from "@npm-downloader/core";

/** 拿到 manifest mock 的引用（带类型断言，便于每个用例配置返回值） */
const manifestMock = pacote.manifest as unknown as ReturnType<typeof vi.fn>;

/** 构造一个 manifest 返回值的工厂，确保字段完整（含 dist.tarball + dependencies） */
const makeManifest = (
  name: string,
  version: string,
  opts: {
    tarball?: string;
    dependencies?: Record<string, string>;
  } = {}
) => ({
  name,
  version,
  dependencies: opts.dependencies ?? {},
  dist: {
    tarball:
      opts.tarball ??
      `https://registry.npmjs.org/${name}/-/${name.replace(/^@[^/]+\//, "")}-${version}.tgz`,
  },
});

/** 构造一个 candidate，字段默认值便于测试聚焦 */
const makeCandidate = (
  overrides: Partial<PeerReserveCandidate> &
    Pick<PeerReserveCandidate, "name">
): PeerReserveCandidate => ({
  ranges: ["*"],
  optional: false,
  declaredBy: ["root@1.0.0"],
  installed: false,
  ...overrides,
});

/** 默认 options：空 existingSpecs，捕获所有 progress 便于断言 */
const defaultOptions = (
  existing: string[] = []
): ResolvePeerReserveOptions => ({
  existingSpecs: new Set(existing),
  concurrency: 4,
  onProgress: () => {},
});

beforeEach(() => {
  // 每个用例前重置 manifest mock 的调用记录与默认实现
  manifestMock.mockReset();
  manifestMock.mockRejectedValue(
    new Error("pacote.manifest not configured for this test")
  );
});

describe("resolvePeerReserve", () => {
  it("① 跳过 installed=true 的候选（不调用 pacote.manifest）", async () => {
    const candidates: PeerReserveCandidate[] = [
      makeCandidate({ name: "@types/node", ranges: [">=18"], installed: true }),
      makeCandidate({ name: "sass", ranges: ["*"], installed: true }),
    ];

    const result = await resolvePeerReserve(candidates, defaultOptions());

    // 没有任何 manifest 调用 —— installed 候选直接跳过
    expect(manifestMock).not.toHaveBeenCalled();
    expect(result.packages).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it("② 未装候选递归收集根 peer + 传递依赖（含 tarball 透传）", async () => {
    // 场景：根 peer `foo@*` 解析到 1.2.3，foo 依赖 `bar@^1.0.0`，
    //      bar 解析到 1.0.5，bar 又依赖 `baz@1.x`，baz 解析到 1.0.0（叶子）。
    manifestMock.mockImplementation(async (spec: string) => {
      if (spec === "foo@*") {
        return makeManifest("foo", "1.2.3", {
          dependencies: { bar: "^1.0.0" },
        });
      }
      if (spec === "bar@^1.0.0") {
        return makeManifest("bar", "1.0.5", {
          tarball: "https://example.test/bar-1.0.5.tgz",
          dependencies: { baz: "1.x" },
        });
      }
      if (spec === "baz@1.x") {
        return makeManifest("baz", "1.0.0", {
          tarball: "https://example.test/baz-1.0.0.tgz",
        });
      }
      throw new Error(`unexpected spec: ${spec}`);
    });

    const candidates: PeerReserveCandidate[] = [
      makeCandidate({ name: "foo", ranges: ["*"] }),
    ];

    const result = await resolvePeerReserve(candidates, defaultOptions());

    // 收集到 3 个包：foo（根 peer）+ bar + baz（传递依赖）
    expect(result.packages).toHaveLength(3);

    const byName = new Map(result.packages.map((p) => [p.name, p]));

    // 根 peer：via 是 candidate.name 自身
    const foo = byName.get("foo");
    expect(foo).toBeDefined();
    expect(foo?.version).toBe("1.2.3");
    expect(foo?.via).toBe("foo");
    expect(foo?.tarball).toContain("foo-1.2.3.tgz");

    // 一级传递依赖 bar：via 是父包 foo
    const bar = byName.get("bar");
    expect(bar).toBeDefined();
    expect(bar?.version).toBe("1.0.5");
    expect(bar?.via).toBe("foo");
    // tarball 严格透传自 manifest.dist.tarball
    expect(bar?.tarball).toBe("https://example.test/bar-1.0.5.tgz");

    // 二级传递依赖 baz：via 是父包 bar
    const baz = byName.get("baz");
    expect(baz).toBeDefined();
    expect(baz?.version).toBe("1.0.0");
    expect(baz?.via).toBe("bar");
    expect(baz?.tarball).toBe("https://example.test/baz-1.0.0.tgz");

    // 无失败
    expect(result.skipped).toEqual([]);
  });

  it("③ existingSpecs 去重：lockfile 已有的 name@version 不重复收集、不再递归", async () => {
    // 场景：foo@* 解析到 1.2.3，其依赖 bar@^1.0.0 → 1.0.5。
    //      但 foo@1.2.3 已在 existingSpecs（模拟 lockfile 已有）。
    //      期望：foo 被跳过（不收集、不递归 bar），最终 packages 为空。
    manifestMock.mockImplementation(async (spec: string) => {
      if (spec === "foo@*") {
        return makeManifest("foo", "1.2.3", { dependencies: { bar: "^1.0.0" } });
      }
      if (spec === "bar@^1.0.0") {
        return makeManifest("bar", "1.0.5");
      }
      throw new Error(`unexpected spec: ${spec}`);
    });

    const candidates: PeerReserveCandidate[] = [
      makeCandidate({ name: "foo", ranges: ["*"] }),
    ];

    const result = await resolvePeerReserve(
      candidates,
      defaultOptions(["foo@1.2.3"]) // 模拟 lockfile 已有 foo@1.2.3
    );

    // foo 命中 visited → 跳过 + 不递归 bar
    expect(result.packages).toEqual([]);
    // foo@* 仍会调用一次 manifest（要先解析才知道 version），
    // 但 bar@^1.0.0 不应被调用（foo 命中 visited 后短路）
    const calledSpecs = manifestMock.mock.calls.map((c) => c[0]);
    expect(calledSpecs).toContain("foo@*");
    expect(calledSpecs).not.toContain("bar@^1.0.0");
    expect(result.skipped).toEqual([]);
  });

  it("④ 同包多 range 各解析（range 内最新满足版），不同 version 各收集一次", async () => {
    // 场景：@vitest/ui 有两个 range ['3.2.4', '4.0.16']，
    //      两个 range 各自解析到精确版本（这里用精确版作为 range 模拟），
    //      期望两个 version 都被收集（同 name 不同 version 不算重复）。
    manifestMock.mockImplementation(async (spec: string) => {
      if (spec === "@vitest/ui@3.2.4") {
        return makeManifest("@vitest/ui", "3.2.4");
      }
      if (spec === "@vitest/ui@4.0.16") {
        return makeManifest("@vitest/ui", "4.0.16");
      }
      throw new Error(`unexpected spec: ${spec}`);
    });

    const candidates: PeerReserveCandidate[] = [
      makeCandidate({ name: "@vitest/ui", ranges: ["3.2.4", "4.0.16"] }),
    ];

    const result = await resolvePeerReserve(candidates, defaultOptions());

    expect(result.packages).toHaveLength(2);
    const versions = result.packages.map((p) => p.version).sort();
    expect(versions).toEqual(["3.2.4", "4.0.16"]);
    // 两个包的 name 都应是 @vitest/ui
    expect(result.packages.every((p) => p.name === "@vitest/ui")).toBe(true);
    // 两个 range 都被调用
    const calledSpecs = manifestMock.mock.calls.map((c) => c[0]).sort();
    expect(calledSpecs).toEqual(["@vitest/ui@3.2.4", "@vitest/ui@4.0.16"]);
  });

  it("④' 同包多 range 解析到同一 version 时，visited 自然去重为单次", async () => {
    // 场景：foo 有 ['^1.0.0', '^1.2.0']，两个 range 都解析到 1.2.3，
    //      期望只收集一次（visited 命中 foo@1.2.3）。
    manifestMock.mockImplementation(async (spec: string) => {
      if (spec === "foo@^1.0.0" || spec === "foo@^1.2.0") {
        return makeManifest("foo", "1.2.3");
      }
      throw new Error(`unexpected spec: ${spec}`);
    });

    const candidates: PeerReserveCandidate[] = [
      makeCandidate({ name: "foo", ranges: ["^1.0.0", "^1.2.0"] }),
    ];

    const result = await resolvePeerReserve(candidates, defaultOptions());

    expect(result.packages).toHaveLength(1);
    expect(result.packages[0]?.version).toBe("1.2.3");
  });

  it("⑤ 根 peer manifest reject 被记录到 skipped 且不中断其他候选", async () => {
    // 场景：三个未装候选 a / b / c，
    //      a@* reject（模拟网络失败/包不存在），
    //      b@* 正常，
    //      c@* 正常 —— 验证 a 的失败不影响 b/c。
    manifestMock.mockImplementation(async (spec: string) => {
      if (spec === "a@*") {
        throw new Error("E404 NOT FOUND");
      }
      if (spec === "b@*") {
        return makeManifest("b", "2.0.0");
      }
      if (spec === "c@*") {
        return makeManifest("c", "3.0.0");
      }
      throw new Error(`unexpected spec: ${spec}`);
    });

    const candidates: PeerReserveCandidate[] = [
      makeCandidate({ name: "a", ranges: ["*"] }),
      makeCandidate({ name: "b", ranges: ["*"] }),
      makeCandidate({ name: "c", ranges: ["*"] }),
    ];

    const result = await resolvePeerReserve(candidates, defaultOptions());

    // b / c 仍正常收集
    expect(result.packages).toHaveLength(2);
    const names = result.packages.map((p) => p.name).sort();
    expect(names).toEqual(["b", "c"]);

    // a 的失败被记录到 skipped
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toMatchObject({
      candidate: "a",
      range: "*",
      error: "E404 NOT FOUND",
    });
  });

  it("⑤' 传递依赖 manifest reject 被记录到 skipped（candidate=父包名）且不中断兄弟", async () => {
    // 场景：root@* → 1.0.0，依赖 bad@^1.0.0（reject）和 good@^1.0.0（正常）。
    //      期望：root 与 good 被收集，bad 失败被记录到 skipped（candidate=root）。
    manifestMock.mockImplementation(async (spec: string) => {
      if (spec === "root@*") {
        return makeManifest("root", "1.0.0", {
          dependencies: { bad: "^1.0.0", good: "^1.0.0" },
        });
      }
      if (spec === "good@^1.0.0") {
        return makeManifest("good", "1.0.0");
      }
      if (spec === "bad@^1.0.0") {
        throw new Error("ETIMEDOUT");
      }
      throw new Error(`unexpected spec: ${spec}`);
    });

    const candidates: PeerReserveCandidate[] = [
      makeCandidate({ name: "root", ranges: ["*"] }),
    ];

    const result = await resolvePeerReserve(candidates, defaultOptions());

    const names = result.packages.map((p) => p.name).sort();
    expect(names).toEqual(["good", "root"]);

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toMatchObject({
      candidate: "root", // 传递依赖失败时 candidate = 父包名
      range: "^1.0.0",
      error: "ETIMEDOUT",
    });
  });

  it("⑥ immutability：不修改入参 candidates 与 existingSpecs", async () => {
    manifestMock.mockImplementation(async (spec: string) => {
      if (spec === "foo@*") {
        return makeManifest("foo", "1.0.0", { dependencies: { bar: "^1.0.0" } });
      }
      if (spec === "bar@^1.0.0") {
        return makeManifest("bar", "1.0.0");
      }
      throw new Error(`unexpected spec: ${spec}`);
    });

    const candidates: PeerReserveCandidate[] = [
      makeCandidate({ name: "foo", ranges: ["*"] }),
    ];
    const existingSpecs = new Set<string>(["pre-existing@1.0.0"]);

    // 入参快照
    const candidatesSnapshot = JSON.parse(JSON.stringify(candidates));
    const existingSnapshot = Array.from(existingSpecs);

    await resolvePeerReserve(candidates, {
      existingSpecs,
      concurrency: 2,
    });

    // candidates 完全未被修改
    expect(candidates).toEqual(candidatesSnapshot);
    // existingSpecs 没有被往里加任何新条目
    expect(Array.from(existingSpecs)).toEqual(existingSnapshot);
  });

  it("⑦ onProgress 回调被调用且输出关键节点信息", async () => {
    manifestMock.mockImplementation(async (spec: string) => {
      if (spec === "foo@*") {
        return makeManifest("foo", "1.0.0");
      }
      throw new Error(`unexpected spec: ${spec}`);
    });

    const progressMsgs: string[] = [];
    const candidates: PeerReserveCandidate[] = [
      makeCandidate({ name: "foo", ranges: ["*"] }),
    ];

    await resolvePeerReserve(candidates, {
      existingSpecs: new Set<string>(),
      onProgress: (msg) => progressMsgs.push(msg),
    });

    // 至少包含开始、resolving、完成三类消息
    expect(progressMsgs.some((m) => m.includes("开始解析"))).toBe(true);
    expect(progressMsgs.some((m) => m.includes("resolving foo@*"))).toBe(true);
    expect(progressMsgs.some((m) => m.includes("解析完成"))).toBe(true);
  });
});
