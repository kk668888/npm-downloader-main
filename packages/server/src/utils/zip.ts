import archiver from "archiver";
import fs from "fs";

/**
 * Create a ZIP archive from a directory
 * @param sourceDir - The source directory to compress
 * @param outputPath - The output ZIP file path
 * @returns The number of bytes written
 */
export async function createZip(
  sourceDir: string,
  outputPath: string
): Promise<number> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve(archive.pointer()));
    archive.on("error", reject);
    output.on("error", reject);

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

/**
 * Format bytes to human-readable format (MB)
 * @param bytes - The number of bytes
 * @returns Formatted string (e.g., "1.23")
 */
export function formatBytes(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2);
}
