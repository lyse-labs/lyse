#!/usr/bin/env node
// Copies bench JSON assets (e.g. taxonomy.v3.json) from src/bench to dist/bench
// so they ship in the npm tarball and are resolvable by taxonomy-loader at runtime.
import { mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, "..");

const assets = [
  ["src/bench/taxonomy.v3.json", "dist/bench/taxonomy.v3.json"],
];

for (const [srcRel, destRel] of assets) {
  const src = join(PKG_ROOT, srcRel);
  const dest = join(PKG_ROOT, destRel);
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(src, dest);
  console.log(`Copied bench asset: ${srcRel} -> ${destRel}`);
}
