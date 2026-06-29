import fs from "fs";
import path from "path";
import type { FailedPackage, TaskStatus } from "@npm-downloader/types";

export function buildTgzFileName(pkg: {
  scope?: string;
  name: string;
  version: string;
}): string {
  if (pkg.scope) {
    return `${pkg.scope.substring(1)}-${pkg.name}-${pkg.version}.tgz`;
  }

  if (pkg.name.startsWith("@")) {
    return `${pkg.name.substring(1).replace("/", "-")}-${pkg.version}.tgz`;
  }

  return `${pkg.name}-${pkg.version}.tgz`;
}

export function findMissingPackages(
  taskDir: string,
  packages: ReadonlyArray<{ scope?: string; name: string; version: string }>
): Array<{ name: string; version: string }> {
  const missing: Array<{ name: string; version: string }> = [];

  for (const pkg of packages) {
    const fileName = buildTgzFileName(pkg);
    const filePath = path.join(taskDir, fileName);

    let exists = false;
    try {
      const stat = fs.statSync(filePath);
      exists = stat.size > 0;
    } catch {
      exists = false;
    }

    if (!exists) {
      const fullName = pkg.scope ? `${pkg.scope}/${pkg.name}` : pkg.name;
      missing.push({ name: fullName, version: pkg.version });
    }
  }

  return missing;
}

export function mergeMissingFailures(
  existing: ReadonlyArray<FailedPackage>,
  missing: ReadonlyArray<{ name: string; version: string }>
): FailedPackage[] {
  const result: FailedPackage[] = [...existing];
  const seen = new Set(existing.map((item) => `${item.name}@${item.version}`));

  for (const item of missing) {
    const key = `${item.name}@${item.version}`;
    if (seen.has(key)) {
      continue;
    }

    result.push({
      name: item.name,
      version: item.version,
      error: "missing after download",
    });
    seen.add(key);
  }

  return result;
}

export async function retryFailedPackages(
  failedPackages: ReadonlyArray<FailedPackage>,
  retryOne: (pkg: FailedPackage) => Promise<void>
): Promise<{
  recovered: FailedPackage[];
  remaining: FailedPackage[];
}> {
  const recovered: FailedPackage[] = [];
  const remaining: FailedPackage[] = [];

  for (const failedPackage of failedPackages) {
    try {
      await retryOne(failedPackage);
      recovered.push(failedPackage);
    } catch (error) {
      remaining.push({
        ...failedPackage,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return { recovered, remaining };
}

export function decideFinalStatus(
  successCount: number,
  totalPackages: number,
  failedPackages: ReadonlyArray<FailedPackage>
): TaskStatus {
  if (totalPackages === 0) return "failed";
  if (failedPackages.length === 0) return "completed";
  if (successCount === 0) return "failed";
  return "partial";
}
