import fs from "fs";
import { describe, expect, it } from "vitest";

type PackageJson = {
  scripts?: Record<string, string>;
};

function readServerPackageJson(): PackageJson {
  const packageJsonPath = new URL("../package.json", import.meta.url);
  const raw = fs.readFileSync(packageJsonPath, "utf8");
  return JSON.parse(raw) as PackageJson;
}

function resolveScript(packageJson: PackageJson, scriptName: string): string {
  const script = packageJson.scripts?.[scriptName];

  expect(script).toBeDefined();

  if (script?.startsWith("pnpm run ")) {
    const referencedScriptName = script.replace("pnpm run ", "").trim();
    const referencedScript = packageJson.scripts?.[referencedScriptName];

    expect(referencedScript).toBeDefined();
    return referencedScript ?? "";
  }

  return script ?? "";
}

describe("server workspace dependency scripts", () => {
  it("build should prepare internal workspace packages first", () => {
    const packageJson = readServerPackageJson();
    const prebuildScript = resolveScript(packageJson, "prebuild");

    expect(prebuildScript).toContain("pnpm -C ../types build");
    expect(prebuildScript).toContain("pnpm -C ../core build");
  });

  it("dev should prepare internal workspace packages first", () => {
    const packageJson = readServerPackageJson();
    const predevScript = resolveScript(packageJson, "predev");

    expect(predevScript).toContain("pnpm -C ../types build");
    expect(predevScript).toContain("pnpm -C ../core build");
  });
});
