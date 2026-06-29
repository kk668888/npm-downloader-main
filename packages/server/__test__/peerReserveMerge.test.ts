/**
 * peerReserveMerge 纯函数单元测试 —— Phase 3
 *
 * 覆盖：
 *   ① 开关解析（parseIncludePeerReserveFlag）：默认 false + 宽松真假值矩阵
 *   ② existingSpecs 构造（buildExistingSpecs）：scope/普通包口径 + immutability
 *   ③ 转换（resolvedPeerToPackageInfo / mapResolvedToPackageInfos）：
 *      scope 包拆分、普通包、tarball 透传、异常 spec 抛错、immutability
 *   ④ 合并（mergePeerReservePackages）：拼接 + immutability（不 mutate 入参）
 */

import { describe, expect, it } from "vitest";
import type { PackageInfo } from "@npm-downloader/core";
import type { ResolvedPeerPackage } from "../src/services/peerReserveService.js";
import {
  buildExistingSpecs,
  mapResolvedToPackageInfos,
  mergePeerReservePackages,
  parseIncludePeerReserveFlag,
  resolvedPeerToPackageInfo,
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
