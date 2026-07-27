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
import { fileURLToPath } from "node:url";
import { parseGoldCorpusYaml } from "../mine-gold-recall.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const CORPUS_PATH = join(REPO_ROOT, "scripts/gold-corpus/color.yaml");
const PINS_ROOT = join(REPO_ROOT, "scripts/gold-corpus/pins");

export interface ProvenanceRecord {
  package: string;
  version: string;
  path: string;
  sha256: string;
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

function main(): void {
  const entries = parseGoldCorpusYaml(readFileSync(CORPUS_PATH, "utf8"));
  for (const entry of entries) {
    const pin = entry.tokenPackage;
    if (pin === undefined) continue;
    const pinsRepoDir = join(PINS_ROOT, entry.repo);
    const { dir, cleanup } = npmPackAndExtract(pin.name, pin.version);
    try {
      const provenance: ProvenanceRecord[] = [];
      for (const rel of pin.files) {
        const content = readFileSync(join(dir, rel), "utf8");
        provenance.push(writePin(pinsRepoDir, pin, rel, content));
      }
      mkdirSync(pinsRepoDir, { recursive: true });
      writeFileSync(join(pinsRepoDir, "PROVENANCE.json"), JSON.stringify(provenance, null, 2) + "\n");
      process.stderr.write(`[fetch-pins] ${entry.repo}: ${provenance.length} file(s) from ${pin.name}@${pin.version}\n`);
    } finally {
      cleanup();
    }
  }
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
