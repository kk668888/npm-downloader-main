import { parsePackage, parsePackageTgzUrl, resolvePackageUrl } from "../src/parser";
import type { PackageInfo } from "../src/types";

describe("parser module", () => {
  describe("parsePackage", () => {
    it("should return null for empty string", () => {
      expect(parsePackage("")).toBeNull();
    });

    it("should parse simple package string", () => {
      const input = "lodash@4.17.21";
      const result = parsePackage(input) as PackageInfo;
      expect(result).toEqual({ name: "lodash", version: "4.17.21" });
    });

    it("should parse scoped package string", () => {
      const input = "@scope/pkg@1.2.3";
      const result = parsePackage(input) as PackageInfo;
      expect(result).toEqual({
        scope: "@scope",
        name: "pkg",
        version: "1.2.3",
      });
    });
  });

  describe("parsePackageTgzUrl", () => {
    it("should generate correct URL for simple package", () => {
      const info: PackageInfo = { name: "lodash", version: "4.17.21" };
      const url = parsePackageTgzUrl(info);
      expect(url).toBe(
        "https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz"
      );
    });

    it("should generate correct URL for scoped package", () => {
      const info: PackageInfo = {
        scope: "@scope",
        name: "pkg",
        version: "1.2.3",
      };
      const url = parsePackageTgzUrl(info);
      expect(url).toBe("https://registry.npmjs.org/@scope/pkg/-/pkg-1.2.3.tgz");
    });
  });

  describe("resolvePackageUrl", () => {
    it("当 pkg.tarball 存在时，应直接返回该 tarball（镜像源/私有源场景）", () => {
      const mirrorTarball =
        "https://registry.npmmirror.com/lodash/-/lodash-4.17.21.tgz";
      const info: PackageInfo = {
        name: "lodash",
        version: "4.17.21",
        tarball: mirrorTarball,
      };

      expect(resolvePackageUrl(info)).toBe(mirrorTarball);
    });

    it("当 pkg.tarball 缺失时，应回退到 parsePackageTgzUrl 的硬拼结果", () => {
      const info: PackageInfo = { name: "lodash", version: "4.17.21" };

      // fallback 必须与 parsePackageTgzUrl 完全一致
      expect(resolvePackageUrl(info)).toBe(parsePackageTgzUrl(info));
      expect(resolvePackageUrl(info)).toBe(
        "https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz"
      );
    });
  });
});
