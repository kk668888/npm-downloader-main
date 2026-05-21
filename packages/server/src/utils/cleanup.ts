import fs from "fs/promises";

/**
 * Clean up multiple files (ignore errors)
 * @param filePaths - Array of file paths to delete (null values are ignored)
 */
export async function cleanupFiles(
  filePaths: Array<string | null>
): Promise<void> {
  await Promise.allSettled(
    filePaths.filter(Boolean).map((path) => fs.unlink(path as string))
  );
}

/**
 * Clean up a directory recursively (ignore errors)
 * @param dirPath - The directory path to delete (null does nothing)
 */
export async function cleanupDirectory(dirPath: string | null): Promise<void> {
  if (dirPath) {
    await fs
      .rm(dirPath, { recursive: true, force: true })
      .catch(() => {
        // Silently ignore cleanup errors
      });
  }
}

/**
 * Clean up both files and directories (ignore errors)
 * @param filePaths - Array of file paths to delete
 * @param dirPaths - Array of directory paths to delete
 */
export async function cleanupAll(
  filePaths: Array<string | null>,
  dirPaths: Array<string | null>
): Promise<void> {
  await Promise.all([
    cleanupFiles(filePaths),
    ...dirPaths.map((dir) => cleanupDirectory(dir)),
  ]);
}
