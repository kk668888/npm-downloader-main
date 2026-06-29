import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseLockFile, resolvePackageUrl } from "./parser.js";
import type { PackageInfo } from "./types.js";

// 把 @pnpm/lockfile-file 整体 mock 掉，避免真实读盘
vi.mock("@pnpm/lockfile-file", () => ({
  readWantedLockfile: vi.fn(),
}));

import { readWantedLockfile } from "@pnpm/lockfile-file";

describe("parseLockFile", () => {
  let tempDir: string;

  beforeEach(() => {
    // 每个用例独立临时目录，写入一个最小合法的 pnpm-lock.yaml 占位文件
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "core-parser-"));
    fs.writeFileSync(path.join(tempDir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    vi.resetAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("优先按 lockfile 已解析结果提取包，包含 snapshots 中的 peer 解析实例", async () => {
    vi.mocked(readWantedLockfile).mockResolvedValue({
      packages: {
        "main@1.0.0": {},
      },
      snapshots: {
        "main@1.0.0(peer-a@2.0.0)": {
          transitivePeerDependencies: ["peer-a"],
        },
        "peer-a@2.0.0": {},
      },
    } as never);

    const result = await parseLockFile(tempDir);

    // 这里用 toMatchObject 而非 toEqual，避免新增加的 tarball 字段（undefined）破坏断言
    expect(result?.packages).toMatchObject([
      { name: "main", version: "1.0.0" },
      { name: "peer-a", version: "2.0.0" },
    ]);
  });

  it("当 packages 段 resolution 含 tarball 时，应将其原样透传到解析结果", async () => {
    // 模拟镜像源场景：tarball 指向 npmmirror，而不是官方 registry
    const mirrorTarball =
      "https://registry.npmmirror.com/lodash/-/lodash-4.17.21.tgz";

    vi.mocked(readWantedLockfile).mockResolvedValue({
      packages: {
        "lodash@4.17.21": {
          resolution: {
            integrity: "sha512-v2kDEe57lecTulaDIuNTPy3Ry4gLGJ6Z1O3vE1krgXZNrsQ+LFTGHVxVjcXPs17LhbZVGedAJv8XZ1tvj5FvA==",
            tarball: mirrorTarball,
          },
        },
      },
    } as never);

    const result = await parseLockFile(tempDir);

    expect(result?.packages).toHaveLength(1);
    // 不可变：返回的对象应包含原 tarball 字段
    expect(result?.packages[0]).toMatchObject({
      name: "lodash",
      version: "4.17.21",
      tarball: mirrorTarball,
    });
  });

  it("当 resolution 缺失（或无 tarball 字段）时，解析结果的 tarball 应为 undefined", async () => {
    // 仅 integrity、无 tarball；以及完全空 resolution 两种情况
    vi.mocked(readWantedLockfile).mockResolvedValue({
      packages: {
        "lodash@4.17.21": {
          resolution: {
            integrity: "sha512-abc",
          },
        },
      },
    } as never);

    const result = await parseLockFile(tempDir);

    expect(result?.packages).toHaveLength(1);
    expect(result?.packages[0]).toMatchObject({
      name: "lodash",
      version: "4.17.21",
    });
    // 显式断言 tarball 为 undefined（fallback 由消费侧 resolvePackageUrl 处理）
    expect(result?.packages[0]?.tarball).toBeUndefined();
  });

  it("patchedDependencies 场景下 key 带 (patch_hash=...) 后缀时，应通过前缀回退命中 tarball", async () => {
    // 模拟 pnpm 打补丁后的 lockfile：packages 段的 key 形如 `lodash@4.17.21(patch_hash=abc)`，
    // 而解析侧生成的 resolutionKey 是纯净 `lodash@4.17.21`，精确查找会失配。
    // 期望：通过 `${resolutionKey}(` 前缀回退，正确取到镜像源 tarball，
    //      而非静默降级为 undefined（会回退到官方 registry 硬拼）。
    const patchedTarball =
      "https://registry.npmmirror.com/lodash/-/lodash-4.17.21.tgz";

    vi.mocked(readWantedLockfile).mockResolvedValue({
      packages: {
        "lodash@4.17.21(patch_hash=abc)": {
          resolution: {
            tarball: patchedTarball,
          },
        },
      },
    } as never);

    const result = await parseLockFile(tempDir);

    expect(result?.packages).toHaveLength(1);
    // 关键断言：tarball 命中补丁条目的镜像地址，而不是 undefined
    expect(result?.packages[0]).toMatchObject({
      name: "lodash",
      version: "4.17.21",
      tarball: patchedTarball,
    });
    expect(result?.packages[0]?.tarball).toBe(patchedTarball);
  });

  it("snapshots 段带 peer 后缀的 key 不应用于读取 resolution（resolution 必须取自 packages 段原始 key）", async () => {
    // 关键边界：main 在 snapshots 中以 "main@1.0.0(peer-a@2.0.0)" 出现，
    // 但 resolution 只存在于 packages 段的 "main@1.0.0" 下。
    // 解析逻辑必须用 packages 的 key 取 resolution，而非 snapshots 的 key。
    const mainTarball = "https://registry.example.com/main/-/main-1.0.0.tgz";

    vi.mocked(readWantedLockfile).mockResolvedValue({
      packages: {
        "main@1.0.0": {
          resolution: {
            tarball: mainTarball,
          },
        },
      },
      snapshots: {
        "main@1.0.0(peer-a@2.0.0)": {},
      },
    } as never);

    const result = await parseLockFile(tempDir);

    // main 只出现一次（去重），且 tarball 命中 packages 段的真实地址
    const mains = result?.packages.filter((p) => p.name === "main") ?? [];
    expect(mains).toHaveLength(1);
    expect(mains[0]?.tarball).toBe(mainTarball);
  });
});

describe("resolvePackageUrl", () => {
  it("当 pkg.tarball 存在时，应直接返回该 tarball", () => {
    const pkg: PackageInfo = {
      name: "lodash",
      version: "4.17.21",
      tarball: "https://registry.npmmirror.com/lodash/-/lodash-4.17.21.tgz",
    };

    expect(resolvePackageUrl(pkg)).toBe(pkg.tarball);
  });

  it("当 pkg.tarball 缺失时，应回退到 parsePackageTgzUrl 的硬拼结果", () => {
    const pkg: PackageInfo = { name: "lodash", version: "4.17.21" };

    expect(resolvePackageUrl(pkg)).toBe(
      "https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz"
    );
  });

  it("scoped 包无 tarball 时也应正确回退", () => {
    const pkg: PackageInfo = {
      scope: "@scope",
      name: "pkg",
      version: "1.2.3",
    };

    expect(resolvePackageUrl(pkg)).toBe(
      "https://registry.npmjs.org/@scope/pkg/-/pkg-1.2.3.tgz"
    );
  });
});
