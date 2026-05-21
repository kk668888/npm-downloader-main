import { readWantedLockfile } from "@pnpm/lockfile-file";
import type { PackageInfo, SkippedDep, LockfileParseResult } from "./types.js";
import { ensureLockFile } from "./utils.js";
import { logger } from "./logger.js";
const pattern: RegExp =
  /^(@[^/]+\/[^@]+|[^@]+)@(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?)/;

/**
 * 根据 lockfile key 推断被跳过的原因
 */
const inferSkipReason = (raw: string): SkippedDep["reason"] => {
  if (raw.includes("link:") || raw.startsWith("link:")) return "link";
  if (raw.includes("file:") || raw.startsWith("file:")) return "file";
  if (raw.includes("workspace:") || raw.startsWith("workspace:")) return "workspace";
  if (raw.startsWith("git+") || raw.startsWith("github:") || raw.includes("://github.com")) return "git";
  if (raw.startsWith("npm:") || raw.includes("::")) return "alias";
  if (raw.startsWith("catalog:")) return "catalog";
  return "unknown";
};

export const parsePackageTgzUrl = (packageInfo: PackageInfo): string => {
  const fullName = packageInfo.scope
    ? `${packageInfo.scope}/${packageInfo.name}`
    : packageInfo.name;
  const urlPackageName = packageInfo.scope
    ? packageInfo.name
    : packageInfo.name;
  return `https://registry.npmjs.org/${fullName}/-/${urlPackageName}-${packageInfo.version}.tgz`;
};

export const parsePackage = (packageStr: string): PackageInfo | null => {
  if (!packageStr) {
    return null;
  }
  const match = packageStr.match(pattern);
  if (match) {
    const fullName = match[1];
    const version = match[2];
    if (!fullName || !version) {
      return null;
    }
    if (fullName.startsWith("@")) {
      const scopeMatch = fullName.match(/^(@[^/]+)\/(.+)$/);
      if (scopeMatch) {
        const scope = scopeMatch[1];
        const name = scopeMatch[2];
        if (!scope || !name) {
          return null;
        }
        logger.info(`Scope: ${scope}, Package: ${name}, Version: ${version}`);
        return { scope, name, version };
      }
    }
    logger.info(`Package: ${fullName}, Version: ${version}`);
    return { name: fullName, version };
  }
  return null;
};

export const parseLockFile = async (
  lockfilePath?: string
): Promise<LockfileParseResult | undefined> => {
  try {
    const { dir, file } = ensureLockFile(lockfilePath);
    logger.info(`Using lockfile: ${file}`);
    const lockfile = await readWantedLockfile(dir, {
      ignoreIncompatible: false,
    });
    if (!lockfile) {
      return undefined;
    }

    const entries = Object.keys(lockfile.packages || {});
    const packages: PackageInfo[] = [];
    const skipped: SkippedDep[] = [];

    for (const raw of entries) {
      const parsed = parsePackage(raw);
      if (parsed) {
        packages.push(parsed);
      } else {
        skipped.push({ raw, reason: inferSkipReason(raw) });
      }
    }

    if (skipped.length > 0) {
      logger.info(
        `Skipped ${skipped.length} non-registry entries: ${skipped.map((s) => s.reason).join(", ")}`
      );
    }

    return { packages, totalEntries: entries.length, skipped };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error({ err }, "Error reading lockfile");
    return undefined;
  }
};
