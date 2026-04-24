import { mkdir, readdir, stat, copyFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceDir = path.join(root, "data", "screenshot-cache");
const targetDir = path.join(root, "public", "screenshot-cache");

async function run() {
  await mkdir(targetDir, { recursive: true });

  let files = [];
  try {
    files = await readdir(sourceDir);
  } catch {
    console.log("No data/screenshot-cache directory found, nothing to promote.");
    return;
  }

  const webpFiles = files.filter((file) => file.endsWith(".webp"));
  if (webpFiles.length === 0) {
    console.log("No .webp files found in data/screenshot-cache.");
    return;
  }

  let copied = 0;
  let totalBytes = 0;
  for (const fileName of webpFiles) {
    const from = path.join(sourceDir, fileName);
    const to = path.join(targetDir, fileName);
    await copyFile(from, to);
    const info = await stat(to);
    totalBytes += info.size;
    copied += 1;
  }

  console.log(`Promoted ${copied} screenshot(s) to public/screenshot-cache`);
  console.log(`Total size: ${Math.round(totalBytes / 1024)} KB`);
}

run().catch((error) => {
  console.error("Failed to promote screenshot cache:", error);
  process.exit(1);
});
