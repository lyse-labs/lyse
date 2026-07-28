#!/usr/bin/env tsx
/**
 * CURATION-ONLY. For each corpus entry with a `tokenPackage`, `npm pack` the
 * pinned version, extract the declared token files to
 * `scripts/gold-corpus/pins/<repo>/<path>`, and (re)write PROVENANCE.json with a
 * sha256 per file. Run manually. NEVER invoked by mine:recall (which reads only
 * the committed snapshots — ADR 0022 §3d). Network happens HERE, at curation.
 *
 * Usage (from repo root): pnpm gold:fetch-pins
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseGoldCorpusYaml } from "../mine-gold-recall.js";
import { loadPinnedTokens } from "../../packages/core/src/reliability/gold/pinned-tokens.js";
import { isColorLiteral } from "../../packages/core/src/reliability/gold/color-eq.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const CORPUS_PATH = join(REPO_ROOT, "scripts/gold-corpus/color.yaml");
const PINS_ROOT = join(REPO_ROOT, "scripts/gold-corpus/pins");

export interface ProvenanceRecord {
  package: string;
  version: string;
  path: string;
  sha256: string;
  method?: "js-resolve";
}

/** Write one snapshot file under pinsRepoDir and return its provenance record. */
export function writePin(
  pinsRepoDir: string,
  pkg: { name: string; version: string },
  filePath: string,
  content: string,
): ProvenanceRecord {
  const abs = join(pinsRepoDir, filePath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
  return {
    package: pkg.name,
    version: pkg.version,
    path: filePath,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}

// npm pack <name>@<version> into a temp dir, extract, return the unpacked package root.
function npmPackAndExtract(name: string, version: string): { dir: string; cleanup: () => void } {
  const work = mkdtempSync(join(tmpdir(), "lyse-pack-"));
  const cleanup = () => rmSync(work, { recursive: true, force: true });
  try {
    const tgz = execFileSync("npm", ["pack", `${name}@${version}`, "--silent"], { cwd: work })
      .toString().trim().split("\n").pop() as string;
    execFileSync("tar", ["-xzf", tgz], { cwd: work });
    // npm tarballs unpack to a top-level "package/" dir.
    return { dir: join(work, "package"), cleanup };
  } catch (e) {
    cleanup();
    throw e;
  }
}

/** Flatten one JS namespace's string exports (each a `--cnvs-…` CSS-var name)
 *  to `{ "<namespace>.<export>": <colour> }` by resolving each var name against
 *  the package's own CSS (`varMap`). Non-string exports, unresolved names, and
 *  non-colour values are dropped (fail-closed). Curation-only. */
export function resolveJsMembers(
  namespace: string,
  exports: Record<string, unknown>,
  varMap: Map<string, string[]>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(exports)) {
    if (typeof value !== "string") continue;
    const resolved = varMap.get(value)?.[0];
    if (resolved === undefined || !isColorLiteral(resolved)) continue;
    out[`${namespace}.${name}`] = resolved;
  }
  return out;
}

async function main(): Promise<void> {
  const entries = parseGoldCorpusYaml(readFileSync(CORPUS_PATH, "utf8"));
  for (const entry of entries) {
    const pin = entry.tokenPackage;
    if (pin === undefined) continue;
    const pinsRepoDir = join(PINS_ROOT, entry.repo);
    const { dir, cleanup } = npmPackAndExtract(pin.name, pin.version);
    try {
      const provenance: ProvenanceRecord[] = [];
      if (pin.js !== undefined) {
        // JS mode: resolve member -> var-name -> colour at curation, commit flat JSON.
        const varMap = loadPinnedTokens(dir, pin.js.cssVars);
        const flat: Record<string, string> = {};
        for (const [namespace, modRel] of Object.entries(pin.js.modules)) {
          const mod = (await import(pathToFileURL(join(dir, modRel)).href)) as Record<string, unknown>;
          Object.assign(flat, resolveJsMembers(namespace, mod, varMap));
        }
        const sorted = Object.fromEntries(
          Object.entries(flat).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        );
        const outPath = pin.files[0];
        if (outPath === undefined) throw new Error(`${entry.repo}: js mode needs files[0] as the JSON output path`);
        const json = JSON.stringify(sorted, null, 2) + "\n";
        const record = writePin(pinsRepoDir, pin, outPath, json);
        provenance.push({ ...record, method: "js-resolve" });
        process.stderr.write(
          `[fetch-pins] ${entry.repo}: js-resolved ${Object.keys(sorted).length} member(s) from ${pin.name}@${pin.version}\n`,
        );
      } else {
        for (const rel of pin.files) {
          const content = readFileSync(join(dir, rel), "utf8");
          provenance.push(writePin(pinsRepoDir, pin, rel, content));
        }
        process.stderr.write(
          `[fetch-pins] ${entry.repo}: ${provenance.length} file(s) from ${pin.name}@${pin.version}\n`,
        );
      }
      mkdirSync(pinsRepoDir, { recursive: true });
      writeFileSync(join(pinsRepoDir, "PROVENANCE.json"), JSON.stringify(provenance, null, 2) + "\n");
    } finally {
      cleanup();
    }
  }
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => {
    process.stderr.write(String(e) + "\n");
    process.exit(1);
  });
}
