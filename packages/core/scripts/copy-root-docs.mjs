#!/usr/bin/env node
// Copies PRIVACY.md + SECURITY.md from repo root into packages/core/ so they
// are included in the npm tarball. Called as the first step of the build script.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, "..");
const REPO_ROOT = join(PKG_ROOT, "../..");

for (const file of ["PRIVACY.md", "SECURITY.md"]) {
  let content = readFileSync(join(REPO_ROOT, file), "utf8");
  // Rewrite repo-root-relative paths to be correct from packages/core/
  content = content.replaceAll(
    "./packages/core/tests/security/no-leak.test.ts",
    "./tests/security/no-leak.test.ts"
  );
  content = content.replaceAll(
    "./packages/core/schemas/v1/lyse-event.json",
    "./schemas/v1/lyse-event.json"
  );
  writeFileSync(join(PKG_ROOT, file), content);
  console.log(`Copied ${file} from repo root.`);
}
