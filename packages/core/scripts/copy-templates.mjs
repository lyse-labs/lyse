#!/usr/bin/env node
// Copies template files from src/commands/templates to dist/commands/templates
// so they are available at runtime and included in the npm tarball.
import { mkdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, "..");
const SRC_TEMPLATES = join(PKG_ROOT, "src/commands/templates");
const DIST_TEMPLATES = join(PKG_ROOT, "dist/commands/templates");

const templates = [];

if (!existsSync(SRC_TEMPLATES) || templates.length === 0) {
  console.log("No templates to copy.");
  process.exit(0);
}

await mkdir(DIST_TEMPLATES, { recursive: true });

for (const file of templates) {
  await copyFile(join(SRC_TEMPLATES, file), join(DIST_TEMPLATES, file));
  console.log(`Copied template: ${file}`);
}
