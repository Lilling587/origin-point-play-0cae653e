import { readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const DIST = "dist";
const SRC = "src";

async function getNewestTimestamp(dir, { ignore = [] } = {}) {
  let newest = 0;
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const relativePath = path.relative(dir, path.join(entry.path || dir, entry.name));
    if (ignore.includes(relativePath)) continue;
    const fullPath = path.join(entry.path || dir, entry.name);
    const { mtimeMs } = await stat(fullPath);
    if (mtimeMs > newest) newest = mtimeMs;
  }
  return newest;
}

async function getOldestTimestamp(dir) {
  if (!existsSync(dir)) return null;
  let oldest = Infinity;
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const fullPath = path.join(entry.path || dir, entry.name);
    const { mtimeMs } = await stat(fullPath);
    if (mtimeMs < oldest) oldest = mtimeMs;
  }
  return oldest === Infinity ? null : oldest;
}

async function main() {
  const [srcNewest, distOldest] = await Promise.all([
    getNewestTimestamp(SRC),
    getOldestTimestamp(DIST),
  ]);

  if (!distOldest) {
    console.error("No dist/ output found. Build may have failed.");
    process.exit(1);
  }

  if (distOldest < srcNewest) {
    console.error("Stale build output detected: dist/ is older than src/.");
    console.error(
      `  Oldest dist file: ${new Date(distOldest).toISOString()}`
    );
    console.error(`  Newest src file:  ${new Date(srcNewest).toISOString()}`);
    process.exit(1);
  }

  console.log("Build output is fresh.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
