import path from "path";
import { fileURLToPath } from "url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDataDir, getTempDir, getUploadDir } from "../src/config/dirs.js";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

describe("directory resolution", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves workspace-relative upload/temp/data directories correctly", () => {
    expect(getUploadDir()).toBe(path.resolve(packageRoot, "uploads"));
    expect(getTempDir()).toBe(path.resolve(packageRoot, "temp"));
    expect(getDataDir()).toBe(path.resolve(packageRoot, "data"));
  });

  it("prefers explicit environment overrides", () => {
    vi.stubEnv("UPLOAD_DIR", "./custom-uploads");
    vi.stubEnv("TEMP_DIR", "./custom-temp");
    vi.stubEnv("DATA_DIR", "./custom-data");

    expect(getUploadDir()).toBe(path.resolve("./custom-uploads"));
    expect(getTempDir()).toBe(path.resolve("./custom-temp"));
    expect(getDataDir()).toBe(path.resolve("./custom-data"));
  });
});
