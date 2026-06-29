/**
 * peerReserveMerge 纯函数单元测试 —— Phase 3
 *
 * 覆盖：
 *   ① 开关解析（parseIncludePeerReserveFlag）：默认 false + 宽松真假值矩阵
 *   ② existingSpecs 构造（buildExistingSpecs）：scope/普通包口径 + immutability
 *   ③ 转换（resolvedPeerToPackageInfo / mapResolvedToPackageInfos）：
 *      scope 包拆分、普通包、tarball 透传、异常 spec 抛错、immutability
 *   ④ 合并（mergePeerReservePackages）：拼接 + immutability（不 mutate 入参）
 *   ⑤ racePeerReserveWithTimeout（强制超时）：
 *      - 永不 resolve 的 resolvePeerReserve 也能在 timeoutMs 后强制返回 [...basePackages]
 *      - 正常 resolve 走转换 + 合并
 *      - service 抛错降级 [...basePackages]
 *      - immutability（不 mutate 入参）
 */

import { describe, expect, it, vi } from "vitest";
import type { PackageInfo, PeerReserveCandidate } from "@npm-downloader/core";
import type { ResolvedPeerPackage } from "../src/services/peerReserveService.js";
import {
  buildExistingSpecs,
  mapResolvedToPackageInfos,
  mergePeerReservePackages,
  parseIncludePeerReserveFlag,
  racePeerReserveWithTimeout,
  resolvedPeerToPackageInfo,
  type ResolvePeerReserveFn,
} from "../src/utils/peerReserveMerge.js";

// ---------------------------------------------------------------------------
// ① 开关解析
// ---------------------------------------------------------------------------

describe("parseIncludePeerReserveFlag", () => {
  it("undefined → false（默认关闭，保证现有行为不变）", () => {
    expect(parseIncludePeerReserveFlag(undefined)).toBe(false);
  });

  it("布尔 true → true；布尔 false → false", () => {
    expect(parseIncludePeerReserveFlag(true)).toBe(true);
    expect(parseIncludePeerReserveFlag(false)).toBe(false);
  });

  it('字符串 "true" / "True" / "TRUE" → true（大小写不敏感 + 空白容忍）', () => {
    expect(parseIncludePeerReserveFlag("true")).toBe(true);
    expect(parseIncludePeerReserveFlag("True")).toBe(true);
    expect(parseIncludePeerReserveFlag("  TRUE  ")).toBe(true);
  });

  it('字符串 "1" → true', () => {
    expect(parseIncludePeerReserveFlag("1")).toBe(true);
  });

  it('字符串 "false" / "0" / 任意其他字符串 → false', () => {
    expect(parseIncludePeerReserveFlag("false")).toBe(false);
    expect(parseIncludePeerReserveFlag("0")).toBe(false);
    expect(parseIncludePeerReserveFlag("yes")).toBe(false); // 不接受 yes
    expect(parseIncludePeerReserveFlag("")).toBe(false);
  });

  it("number 1 → true；其他 number → false", () => {
    expect(parseIncludePeerReserveFlag(1)).toBe(true);
    expect(parseIncludePeerReserveFlag(0)).toBe(false);
    expect(parseIncludePeerReserveFlag(2)).toBe(false);
  });

  it("null / 对象 / 数组 → false（防御性）", () => {
    expect(parseIncludePeerReserveFlag(null)).toBe(false);
    expect(parseIncludePeerReserveFlag({})).toBe(false);
    expect(parseIncludePeerReserveFlag([1])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ② existingSpecs 构造
// ---------------------------------------------------------------------------

describe("buildExistingSpecs", () => {
  it("scope 包：spec 为 `${scope}/${name}@${version}`", () => {
    const packages: PackageInfo[] = [
      { scope: "@types", name: "node", version: "20.1.0" },
    ];
    const specs = buildExistingSpecs(packages);
    expect(specs.has("@types/node@20.1.0")).toBe(true);
    expect(specs.size).toBe(1);
  });

  it("普通包：spec 为 `name@version`", () => {
    const packages: PackageInfo[] = [
      { name: "lodash", version: "4.17.21" },
    ];
    const specs = buildExistingSpecs(packages);
    expect(specs.has("lodash@4.17.21")).toBe(true);
  });

  it("混合包：口径与 service 内 buildSpec 一致", () => {
    const packages: PackageInfo[] = [
      { scope: "@babel", name: "core", version: "7.0.0" },
      { name: "react", version: "18.0.0" },
      { scope: "@types", name: "node", version: "20.0.0", tarball: "http://x/y.tgz" },
    ];
    const specs = buildExistingSpecs(packages);
    expect(specs.has("@babel/core@7.0.0")).toBe(true);
    expect(specs.has("react@18.0.0")).toBe(true);
    expect(specs.has("@types/node@20.0.0")).toBe(true);
    expect(specs.size).toBe(3);
  });

  it("immutability：不修改入参数组及其元素", () => {
    const packages: PackageInfo[] = [
      { scope: "@types", name: "node", version: "20.1.0" },
    ];
    const snapshot = JSON.parse(JSON.stringify(packages));
    buildExistingSpecs(packages);
    expect(packages).toEqual(snapshot); // 入参未被修改
  });

  it("空数组 → 空 Set", () => {
    expect(buildExistingSpecs([]).size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ③ 转换：ResolvedPeerPackage → PackageInfo
// ---------------------------------------------------------------------------

describe("resolvedPeerToPackageInfo", () => {
  it("scope 包：name 含 @ 时正确拆分为 scope + name", () => {
    const rp: ResolvedPeerPackage = {
      name: "@types/node",
      version: "20.1.0",
      tarball: "https://registry.npmjs.org/@types/node/-/node-20.1.0.tgz",
      via: "root",
    };
    const info = resolvedPeerToPackageInfo(rp);
    expect(info.scope).toBe("@types");
    expect(info.name).toBe("node");
    expect(info.version).toBe("20.1.0");
    expect(info.tarball).toBe(rp.tarball);
  });

  it("普通包：name 不含 @，scope 为 undefined", () => {
    const rp: ResolvedPeerPackage = {
      name: "lodash",
      version: "4.17.21",
      tarball: "https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz",
      via: "root",
    };
    const info = resolvedPeerToPackageInfo(rp);
    expect(info.scope).toBeUndefined();
    expect(info.name).toBe("lodash");
    expect(info.version).toBe("4.17.21");
    expect(info.tarball).toBe(rp.tarball);
  });

  it("tarball 严格透传（即便来自私有源）", () => {
    const privateTarball = "https://npm.my-corp.com/@scope/pkg/-/pkg-1.2.3.tgz";
    const rp: ResolvedPeerPackage = {
      name: "@scope/pkg",
      version: "1.2.3",
      tarball: privateTarball,
      via: "x@1.0.0",
    };
    expect(resolvedPeerToPackageInfo(rp).tarball).toBe(privateTarball);
  });

  it("via 字段不进入 PackageInfo（PackageInfo 无该字段）", () => {
    const rp: ResolvedPeerPackage = {
      name: "foo",
      version: "1.0.0",
      tarball: "http://x/foo-1.0.0.tgz",
      via: "via-from-parent",
    };
    const info = resolvedPeerToPackageInfo(rp);
    expect((info as unknown as Record<string, unknown>).via).toBeUndefined();
  });

  it("immutability：不修改入参 rp", () => {
    const rp: ResolvedPeerPackage = {
      name: "foo",
      version: "1.0.0",
      tarball: "http://x/foo-1.0.0.tgz",
      via: "root",
    };
    const snapshot = { ...rp };
    resolvedPeerToPackageInfo(rp);
    expect(rp).toEqual(snapshot);
  });

  it("异常 spec（无法解析）→ 抛出明确错误（防御性，正常不可达）", () => {
    // 故意构造一个 parsePackage 无法匹配的 version（无数字版本号）
    const rp = {
      name: "foo",
      version: "not-a-version",
      tarball: "http://x.tgz",
      via: "root",
    } as ResolvedPeerPackage;
    expect(() => resolvedPeerToPackageInfo(rp)).toThrow(/无法解析 peer 储备包 spec/);
  });
});

describe("mapResolvedToPackageInfos", () => {
  it("批量转换：scope 包 + 普通包混合", () => {
    const resolved: ResolvedPeerPackage[] = [
      { name: "@types/node", version: "20.0.0", tarball: "http://a.tgz", via: "x" },
      { name: "lodash", version: "4.17.21", tarball: "http://b.tgz", via: "y" },
    ];
    const infos = mapResolvedToPackageInfos(resolved);
    expect(infos).toHaveLength(2);
    expect(infos[0]).toMatchObject({ scope: "@types", name: "node", version: "20.0.0" });
    expect(infos[1]).toMatchObject({ name: "lodash", version: "4.17.21" });
    expect(infos[0]?.tarball).toBe("http://a.tgz");
    expect(infos[1]?.tarball).toBe("http://b.tgz");
  });

  it("空数组 → 空数组", () => {
    expect(mapResolvedToPackageInfos([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ④ 合并
// ---------------------------------------------------------------------------

describe("mergePeerReservePackages", () => {
  it("把 peer 储备包拼接到原 packages 之后", () => {
    const base: PackageInfo[] = [
      { name: "react", version: "18.0.0" },
    ];
    const peer: PackageInfo[] = [
      { scope: "@types", name: "react", version: "18.0.0", tarball: "http://t.tgz" },
    ];
    const merged = mergePeerReservePackages(base, peer);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toEqual({ name: "react", version: "18.0.0" });
    expect(merged[1]).toMatchObject({ scope: "@types", name: "react" });
  });

  it("immutability：不修改入参 basePackages（关键 —— processAll 依赖此契约）", () => {
    const base: PackageInfo[] = [{ name: "react", version: "18.0.0" }];
    const peer: PackageInfo[] = [
      { name: "lodash", version: "4.17.21", tarball: "http://x.tgz" },
    ];
    const baseSnapshot = JSON.parse(JSON.stringify(base));
    mergePeerReservePackages(base, peer);
    // 入参 base 数组长度与元素均未被修改
    expect(base).toEqual(baseSnapshot);
    expect(base).toHaveLength(1);
  });

  it("immutability：不修改入参 peerPackages", () => {
    const base: PackageInfo[] = [{ name: "react", version: "18.0.0" }];
    const peer: PackageInfo[] = [
      { name: "lodash", version: "4.17.21", tarball: "http://x.tgz" },
    ];
    const peerSnapshot = JSON.parse(JSON.stringify(peer));
    mergePeerReservePackages(base, peer);
    expect(peer).toEqual(peerSnapshot);
  });

  it("peer 为空 → 返回仅含 base 的新数组（不短路返回原引用）", () => {
    const base: PackageInfo[] = [{ name: "react", version: "18.0.0" }];
    const merged = mergePeerReservePackages(base, []);
    expect(merged).toEqual(base);
    expect(merged).not.toBe(base); // 必须是新数组，避免外部 mutate 影响原 base
  });

  it("base 为空 → 返回仅含 peer 的新数组", () => {
    const peer: PackageInfo[] = [{ name: "foo", version: "1.0.0" }];
    const merged = mergePeerReservePackages([], peer);
    expect(merged).toEqual(peer);
  });

  it("合并后元素的 tarball 字段保留（下载侧 resolvePackageUrl 依赖）", () => {
    const base: PackageInfo[] = [];
    const peer: PackageInfo[] = [
      { name: "foo", version: "1.0.0", tarball: "https://private/x.tgz" },
    ];
    const merged = mergePeerReservePackages(base, peer);
    expect(merged[0]?.tarball).toBe("https://private/x.tgz");
  });
});

// ---------------------------------------------------------------------------
// ⑤ racePeerReserveWithTimeout —— controller 层强制超时（Promise.race）
// ---------------------------------------------------------------------------

describe("racePeerReserveWithTimeout", () => {
  /** 一个常驻的 basePackages + candidates + existingSpecs，供各用例复用 */
  const basePackages: PackageInfo[] = [
    { name: "react", version: "18.2.0" },
  ];
  const candidates: PeerReserveCandidate[] = [
    { name: "@vitest/ui", ranges: ["^3.0.0"], installed: false },
  ];
  const existingSpecs = new Set<string>(["react@18.2.0"]);

  it("核心用例：resolvePeerReserve 永不 resolve 时，timeoutMs 到点强制返回 [...basePackages] 且不挂起", async () => {
    // 模拟实测场景：service 内 Promise.all 永不 resolve（pacote@21 不响应 AbortSignal）
    // 返回一个永不 settle 的 Promise，验证 race 的 timeoutPromise 必然赢得 race。
    const neverResolve: ResolvePeerReserveFn = vi.fn(
      () => new Promise<never>(() => {})
    );

    // 用很小的超时（50ms）便于测试快速完成；真实默认 90000ms
    const start = Date.now();
    const result = await racePeerReserveWithTimeout({
      resolvePeerReserve: neverResolve,
      candidates,
      basePackages,
      existingSpecs,
      timeoutMs: 50,
    });
    const elapsed = Date.now() - start;

    // 断言 1：超时标志为 true
    expect(result.timedOut).toBe(true);
    // 断言 2：packages 退化为 [...basePackages]（放弃 peer 储备，主流程继续）
    expect(result.packages).toEqual(basePackages);
    expect(result.packages).not.toBe(basePackages); // 必须是新数组（immutability）
    // 断言 3：产生了 warn 日志（含超时秒数）
    const warnLogs = result.logEvents.filter((e) => e.level === "warn");
    expect(warnLogs.length).toBeGreaterThanOrEqual(1);
    expect(warnLogs[0]?.message).toMatch(/peer 储备解析超时/);
    expect(warnLogs[0]?.message).toMatch(/0\.05s/); // 50ms = 0.05s
    // 断言 4：确实等了大约 50ms（而非立即返回或永久挂起）
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(elapsed).toBeLessThan(2000); // 防御：若永久挂起 vitest 30s timeout 会先触发
  });

  it("正常 resolve：走转换 + 不可变合并，日志含新增数量", async () => {
    const resolved: ResolvedPeerPackage = {
      name: "@vitest/ui",
      version: "3.1.0",
      tarball: "https://reg/@vitest/ui/-/ui-3.1.0.tgz",
      via: "@vitest/ui",
    };
    const okResolve: ResolvePeerReserveFn = vi.fn(async () => ({
      packages: [resolved],
      skipped: [],
    }));

    const result = await racePeerReserveWithTimeout({
      resolvePeerReserve: okResolve,
      candidates,
      basePackages,
      existingSpecs,
      timeoutMs: 1000, // 故意大，正常分支应远在此之前返回
    });

    expect(result.timedOut).toBe(false);
    // base + 1 个 peer = 2 个
    expect(result.packages).toHaveLength(2);
    expect(result.packages[0]).toEqual(basePackages[0]);
    // peer 包已正确拆分（@vitest/ui → scope=@vitest, name=ui）+ tarball 透传
    expect(result.packages[1]).toMatchObject({
      scope: "@vitest",
      name: "ui",
      version: "3.1.0",
      tarball: resolved.tarball,
    });
    // info 日志含“新增 1 个包”
    const infoLogs = result.logEvents.filter((e) => e.level === "info");
    expect(infoLogs.some((e) => /新增 1 个包/.test(e.message))).toBe(true);
  });

  it("正常 resolve 但有 skipped：每个失败条目产生一条 warn", async () => {
    const okResolve: ResolvePeerReserveFn = vi.fn(async () => ({
      packages: [],
      skipped: [
        { candidate: "foo", range: "^1.0.0", error: "ETARGET" },
        { candidate: "bar", range: "^2.0.0", error: "E404" },
      ],
    }));

    const result = await racePeerReserveWithTimeout({
      resolvePeerReserve: okResolve,
      candidates,
      basePackages,
      existingSpecs,
      timeoutMs: 1000,
    });

    expect(result.timedOut).toBe(false);
    // 无新增 peer 包，仅原 base
    expect(result.packages).toEqual(basePackages);
    // 2 条失败 warn + 汇总 info 提到“2 个解析失败”
    const failWarns = result.logEvents.filter(
      (e) => e.level === "warn" && /peer 储备解析失败/.test(e.message)
    );
    expect(failWarns).toHaveLength(2);
    const summary = result.logEvents.find((e) => /新增 0 个包/.test(e.message));
    expect(summary?.message).toMatch(/2 个解析失败/);
  });

  it("service 抛错（理论不应发生）：降级 [...basePackages]，不中断", async () => {
    const throwingResolve: ResolvePeerReserveFn = vi.fn(async () => {
      throw new Error("unexpected boom");
    });

    const result = await racePeerReserveWithTimeout({
      resolvePeerReserve: throwingResolve,
      candidates,
      basePackages,
      existingSpecs,
      timeoutMs: 1000,
    });

    expect(result.timedOut).toBe(false); // 抛错不算超时
    expect(result.packages).toEqual(basePackages);
    expect(result.packages).not.toBe(basePackages); // 新数组
    const warn = result.logEvents.find((e) => /peer 储备解析异常/.test(e.message));
    expect(warn?.message).toMatch(/unexpected boom/);
  });

  it("immutability：不 mutate 入参 basePackages / candidates / existingSpecs", async () => {
    const baseSnapshot = [...basePackages];
    const candSnapshot = candidates.map((c) => ({ ...c, ranges: [...c.ranges] }));
    const specsSnapshot = new Set(existingSpecs);
    const resolved: ResolvedPeerPackage = {
      name: "@vitest/ui",
      version: "3.1.0",
      tarball: "https://reg/x.tgz",
      via: "@vitest/ui",
    };
    const okResolve: ResolvePeerReserveFn = vi.fn(async () => ({
      packages: [resolved],
      skipped: [],
    }));

    await racePeerReserveWithTimeout({
      resolvePeerReserve: okResolve,
      candidates,
      basePackages,
      existingSpecs,
      timeoutMs: 1000,
    });

    expect(basePackages).toEqual(baseSnapshot);
    expect(candidates).toEqual(candSnapshot);
    expect(existingSpecs).toEqual(specsSnapshot);
  });

  it("timer 清理：正常返回后不会因 race timer 泄漏而触发多余 resolve", async () => {
    // 用 spy 监视 timeoutPromise 是否在 race 结束后仍被 resolve（不应有副作用，
    // 但 clearTimeout 应确保 timer 不残留）。
    const okResolve: ResolvePeerReserveFn = vi.fn(async () => ({
      packages: [],
      skipped: [],
    }));
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

    await racePeerReserveWithTimeout({
      resolvePeerReserve: okResolve,
      candidates,
      basePackages,
      existingSpecs,
      timeoutMs: 1000,
    });

    // 正常分支下，clearTimeout 至少被调用 1 次（清理 race timer）
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});
