/**
 * peerReserveService 单元测试 —— Phase 2（非递归版）
 *
 * 全部 mock pacote.manifest，**不真联网**。
 *
 * 覆盖用例：
 *   ① installed 候选被跳过
 *   ② 未装候选只收集根 peer 自身（非递归，dependencies 不被收集、不被请求）
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

  it("② 未装候选只收集根 peer 自身（非递归：dependencies 不被收集、也不被请求）", async () => {
    // 场景：根 peer `foo@*` 解析到 1.2.3，foo 的 manifest **带** dependencies
    //      （bar@^1.0.0 → baz@1.x 等，模拟 msw/sass 这种依赖树庞大的 peer）。
    //      期望（非递归）：
    //        - 只收集 foo 自身 1 个包（不收集 bar/baz）；
    //        - pacote.manifest 只被根 peer 调用 1 次，**不会因 dependencies 再次被调用**；
    //        - via 永远等于根 peer 的 candidate.name（foo）。
    manifestMock.mockImplementation(async (spec: string) => {
      if (spec === "foo@*") {
        return makeManifest("foo", "1.2.3", {
          dependencies: { bar: "^1.0.0" },
        });
      }
      // 即便 manifest 声明了 bar/baz 这些 spec，非递归模式下都不应到达这里
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

    // 只收集 foo 自身 1 个包（非递归，不展开 dependencies）
    expect(result.packages).toHaveLength(1);

    const foo = result.packages[0];
    expect(foo).toBeDefined();
    expect(foo?.name).toBe("foo");
    expect(foo?.version).toBe("1.2.3");
    expect(foo?.via).toBe("foo"); // 非递归：via 永远是根 peer 的 candidate.name
    expect(foo?.tarball).toContain("foo-1.2.3.tgz");

    // 无失败
    expect(result.skipped).toEqual([]);

    // —— 关键断言（直接证明非递归）：pacote.manifest 只被根 peer 调用 ——
    const calledSpecs = manifestMock.mock.calls.map((c) => c[0]);
    expect(calledSpecs).toEqual(["foo@*"]); // 只调用了根 peer，未调用 bar/baz
    expect(calledSpecs).not.toContain("bar@^1.0.0");
    expect(calledSpecs).not.toContain("baz@1.x");
    // manifest 只被调用 1 次（核心反递归证据）
    expect(manifestMock).toHaveBeenCalledTimes(1);
  });

  it("②' 多个未装根 peer 各自只收集自身（非递归：相互 dependencies 完全不展开）", async () => {
    // 场景：两个未装根 peer foo@* / qux@*，它们的 manifest 都带 dependencies。
    //      期望：只收集 foo、qux 自身；dependencies 中声明的 bar/baz 一个都不收、一个都不请求。
    manifestMock.mockImplementation(async (spec: string) => {
      if (spec === "foo@*") {
        return makeManifest("foo", "1.2.3", {
          dependencies: { bar: "^1.0.0" },
        });
      }
      if (spec === "qux@*") {
        return makeManifest("qux", "9.9.9", {
          dependencies: { baz: "1.x" },
        });
      }
      throw new Error(`unexpected spec: ${spec}`);
    });

    const candidates: PeerReserveCandidate[] = [
      makeCandidate({ name: "foo", ranges: ["*"] }),
      makeCandidate({ name: "qux", ranges: ["*"] }),
    ];

    const result = await resolvePeerReserve(candidates, defaultOptions());

    // 只收集 foo、qux 自身（共 2 个），不收集 bar/baz
    expect(result.packages).toHaveLength(2);
    const byName = new Map(result.packages.map((p) => [p.name, p]));
    expect(byName.get("foo")?.via).toBe("foo");
    expect(byName.get("qux")?.via).toBe("qux");

    // 只调用了 foo@* 与 qux@*，没有因 dependencies 再去请求 bar/baz
    const calledSpecs = manifestMock.mock.calls.map((c) => c[0]).sort();
    expect(calledSpecs).toEqual(["foo@*", "qux@*"]);
    expect(manifestMock).toHaveBeenCalledTimes(2);
  });

  it("③ existingSpecs 去重：lockfile 已有的 name@version 不重复收集", async () => {
    // 场景：foo@* 解析到 1.2.3。但 foo@1.2.3 已在 existingSpecs（模拟 lockfile 已有）。
    //      期望：foo 被跳过（不收集），最终 packages 为空。
    manifestMock.mockImplementation(async (spec: string) => {
      if (spec === "foo@*") {
        return makeManifest("foo", "1.2.3", { dependencies: { bar: "^1.0.0" } });
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

    // foo 命中 visited → 跳过（不收集）
    expect(result.packages).toEqual([]);
    // foo@* 仍会调用一次 manifest（要先解析才知道 version）
    const calledSpecs = manifestMock.mock.calls.map((c) => c[0]);
    expect(calledSpecs).toContain("foo@*");
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

  it("⑤' 根 peer 多 range 时单个 range 失败被记 skipped 且不中断其他 range", async () => {
    // 场景（非递归）：foo 有两个 range ['^1.0.0', '^2.0.0']，
    //      ^1.0.0 解析失败（ETIMEDOUT），^2.0.0 解析成功 → 2.0.0。
    //      期望：foo@2.0.0 被收集，^1.0.0 的失败被记录到 skipped（candidate=foo）。
    manifestMock.mockImplementation(async (spec: string) => {
      if (spec === "foo@^1.0.0") {
        throw new Error("ETIMEDOUT");
      }
      if (spec === "foo@^2.0.0") {
        return makeManifest("foo", "2.0.0");
      }
      throw new Error(`unexpected spec: ${spec}`);
    });

    const candidates: PeerReserveCandidate[] = [
      makeCandidate({ name: "foo", ranges: ["^1.0.0", "^2.0.0"] }),
    ];

    const result = await resolvePeerReserve(candidates, defaultOptions());

    // foo@2.0.0 被收集
    expect(result.packages).toHaveLength(1);
    expect(result.packages[0]?.name).toBe("foo");
    expect(result.packages[0]?.version).toBe("2.0.0");

    // foo@^1.0.0 的失败被记录到 skipped（candidate=foo）
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toMatchObject({
      candidate: "foo",
      range: "^1.0.0",
      error: "ETIMEDOUT",
    });
  });

  it("⑥ immutability：不修改入参 candidates 与 existingSpecs", async () => {
    manifestMock.mockImplementation(async (spec: string) => {
      if (spec === "foo@*") {
        return makeManifest("foo", "1.0.0", { dependencies: { bar: "^1.0.0" } });
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

  it("⑧ signal 透传：pacote.manifest 第二参包含传入的 signal", async () => {
    // 验证 options.signal 被原样透传给 pacote.manifest(spec, { signal }) 的第二参。
    manifestMock.mockImplementation(async () => makeManifest("foo", "1.0.0"));

    const ac = new AbortController();
    const candidates: PeerReserveCandidate[] = [
      makeCandidate({ name: "foo", ranges: ["*"] }),
    ];

    await resolvePeerReserve(candidates, {
      existingSpecs: new Set<string>(),
      signal: ac.signal,
    });

    // manifest 被调用过，且每次调用的第二参都包含 { signal: ac.signal }
    expect(manifestMock).toHaveBeenCalled();
    for (const call of manifestMock.mock.calls) {
      const opts = call[1];
      expect(opts).toBeDefined();
      expect((opts as { signal: AbortSignal }).signal).toBe(ac.signal);
    }
  });

  it("⑨ signal abort 后进行中的根 peer 请求被记 skipped，resolvePeerReserve 仍正常返回（不 reject）", async () => {
    // 场景（非递归版）：根 peer foo@* 的 manifest 是一个“永不 resolve”的 pending promise，
    //      模拟联网卡死。abort 后该 pending 应以 AbortError reject，被记入 skipped，
    //      resolvePeerReserve 正常返回（packages 空 + skipped 的 foo）。
    //      （原递归版用 foo+bar 验证，非递归后无 bar，改用根 peer pending 直接验证。）
    const ac = new AbortController();
    // foo 的 manifest：返回一个由 signal 控制的 pending —— 模拟 pacote 在 abort 时 reject
    const fooPending = new Promise((_resolve, reject) => {
      ac.signal.addEventListener("abort", () => {
        const e = new Error("The user aborted a request");
        e.name = "AbortError";
        reject(e);
      });
    });

    manifestMock.mockImplementation(async (spec: string) => {
      if (spec === "foo@*") {
        // foo 卡住，直到 abort 才 reject
        return fooPending as Promise<unknown>;
      }
      throw new Error(`unexpected spec: ${spec}`);
    });

    const candidates: PeerReserveCandidate[] = [
      makeCandidate({ name: "foo", ranges: ["*"] }),
    ];

    // 触发 abort（同步即可，foo 已挂起等待 abort 事件）
    queueMicrotask(() => ac.abort());

    // 关键断言：即便发生 abort，resolvePeerReserve 也不 reject
    const result = await resolvePeerReserve(candidates, {
      existingSpecs: new Set<string>(),
      signal: ac.signal,
    });

    // foo 因 abort 失败，被记入 skipped（candidate=foo）
    expect(result.packages).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toMatchObject({
      candidate: "foo",
      range: "*",
    });
  });
});
