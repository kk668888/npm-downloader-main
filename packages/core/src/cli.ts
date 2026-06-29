import path from "path";
import pLimit from "p-limit";
import { parseLockFile, resolvePackageUrl } from "./parser.js";
import { downloadTgzFile } from "./downloader.js";
import { clearDownloadPath, ensureDownloadPath } from "./utils.js";
import type { PackageInfo, PackageUrlInfo } from "./types.js";
import { logger } from "./logger.js";
const limit = pLimit(6);

const downloadPath: string = path.resolve("./downloadTgz");

interface CliOptions {
  lockfile?: string;
  limit?: number;
}

const printUsage = (): void => {
  logger.info(
    [
      "Usage: pnpm ts-node src/index.ts [options]",
      "",
      "Options:",
      "  -l, --lockfile <path>  Path to pnpm-lock.yaml or its directory",
      "  -n, --limit <count>    Download only the first <count> packages",
      "  -h, --help             Show this message",
    ].join("\n")
  );
};

const parseCliArgs = (): CliOptions => {
  const args = process.argv.slice(2);
  const options: CliOptions = {};

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) {
      continue;
    }
    switch (arg) {
      case "-h":
      case "--help":
        printUsage();
        process.exit(0);
      case "-l":
      case "--lockfile": {
        const value = args[i + 1];
        if (!value) {
          logger.error("Missing path after --lockfile option");
          process.exit(1);
        }
        options.lockfile = value;
        i += 1;
        break;
      }
      case "-n":
      case "--limit": {
        const value = args[i + 1];
        if (!value) {
          logger.error("Missing value after --limit option");
          process.exit(1);
        }
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          logger.error("--limit must be a positive number");
          process.exit(1);
        }
        options.limit = Math.floor(parsed);
        i += 1;
        break;
      }
      default:
        if (!arg.startsWith("-") && !options.lockfile) {
          options.lockfile = arg;
        } else if (arg.startsWith("-")) {
          logger.warn(`Unknown argument: ${arg}`);
        }
        break;
    }
  }

  return options;
};

const main = async (): Promise<void> => {
  const { lockfile, limit: limitOption } = parseCliArgs();
  const normalizedLockfile = lockfile ? path.resolve(lockfile) : undefined;
  const parseResult = await parseLockFile(normalizedLockfile);
  if (!parseResult || parseResult.packages.length === 0) {
    logger.error("Failed to parse lockfile");
    return;
  }

  const packages = parseResult.packages;

  // CLI 提示被跳过的依赖
  if (parseResult.skipped.length > 0) {
    logger.info(
      `Skipped ${parseResult.skipped.length} non-registry entries (${parseResult.skipped.length}/${parseResult.totalEntries} total)`
    );
  }

  const packageSelection =
    typeof limitOption === "number" ? packages.slice(0, limitOption) : packages;
  // 注意：item 必须用 PackageInfo 类型，才能把解析阶段透传的 tarball 字段带下去，
  // 否则显式注解为 { scope; name; version } 会把 tarball 字段丢掉，导致回退到硬拼 URL。
  const tgzInfos: PackageUrlInfo[] = packageSelection.map((item: PackageInfo) => ({
    ...item,
    url: resolvePackageUrl(item),
  }));
  clearDownloadPath(downloadPath);
  ensureDownloadPath(downloadPath);
  const downloadPromise = tgzInfos.map((tgzInfo) =>
    limit(async () => {
      try {
        await downloadTgzFile(tgzInfo, downloadPath);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error(
          `Failed to download ${tgzInfo.name}@${tgzInfo.version}: ${err.message}`
        );
      }
    })
  );
  await Promise.all(downloadPromise);
};
main().catch((error) => {
  const err = error instanceof Error ? error : new Error(String(error));
  logger.error({ err }, "Download task failed");
  process.exit(1);
});
