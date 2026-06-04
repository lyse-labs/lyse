#!/usr/bin/env node
// Generates rules-manifest.json from the TypeScript metadata, called from `build` script.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, "..");

// Load the compiled manifest from dist/ (assumes build:tsc ran first)
const { RULE_MANIFEST_OBJECT } = await import(join(PKG_ROOT, "dist/rules/manifest.js"));
const out = JSON.stringify(RULE_MANIFEST_OBJECT, null, 2) + "\n";
writeFileSync(join(PKG_ROOT, "rules-manifest.json"), out);
console.log(`Wrote rules-manifest.json (${RULE_MANIFEST_OBJECT.rules.length} rules)`);
