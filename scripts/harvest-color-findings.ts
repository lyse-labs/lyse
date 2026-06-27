#!/usr/bin/env tsx
/**
 * Harvest harness — run tokens/no-hardcoded-color over a directory of repos,
 * emit each finding with surrounding source context.
 *
 * Usage (CLI):
 *   tsx scripts/harvest-color-findings.ts <reposDir> <outFile.jsonl>
 *
 * Exported API:
 *   collectColorFindings(rootDir: string): Promise<HarvestRow[]>
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, extname, relative } from "node:path";
import { detectInText } from "../packages/core/src/rules/tokens-no-hardcoded-color.js";
import {
  isLowSignalValueFile,
  isSchemaOrDataFile,
  isColorTokenDefFile,
  isInExampleOrSchemaValuePosition,
} from "../packages/core/src/rules/_skip-context.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface HarvestRow {
  /** First path segment under rootDir — i.e. the repo name. */
  repo: string;
  /** Relative path from the repo root. */
  file: string;
  /** 1-based line number of the flagged color value. */
  line: number;
  /** Flagged line ±2 lines of surrounding context, joined with newlines. */
  snippet: string;
  /** Lowercased file extension, e.g. ".css", ".tsx". */
  fileType: string;
}

// ---------------------------------------------------------------------------
// File walker
// ---------------------------------------------------------------------------

const SUPPORTED_EXT = /\.(tsx?|jsx?|mjs|cjs|s?css|svelte|vue)$/i;
const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", ".cache"]);

function walkRepo(repoDir: string): string[] {
  const results: string[] = [];

  function visit(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (IGNORED_DIRS.has(name)) continue;
      const full = join(dir, name);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        visit(full);
      } else if (stat.isFile() && SUPPORTED_EXT.test(name)) {
        results.push(full);
      }
    }
  }

  visit(repoDir);
  return results;
}

// ---------------------------------------------------------------------------
// Location helpers
// ---------------------------------------------------------------------------

function lineNumberFromIndex(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source.charCodeAt(i) === 10) line++;
  }
  return line;
}

function snippetAround(source: string, lineNum: number): string {
  const lines = source.split("\n");
  const start = Math.max(0, lineNum - 3); // 0-based index, ±2 lines
  const end = Math.min(lines.length, lineNum + 2); // exclusive
  return lines.slice(start, end).join("\n");
}

// ---------------------------------------------------------------------------
// Core collector
// ---------------------------------------------------------------------------

/**
 * Runs tokens/no-hardcoded-color detection over every repo directory found
 * as an immediate child of `rootDir`. Returns one HarvestRow per finding,
 * sorted deterministically by (repo, file, line).
 */
export async function collectColorFindings(rootDir: string): Promise<HarvestRow[]> {
  let repoDirs: string[];
  try {
    repoDirs = readdirSync(rootDir)
      .map((name) => ({ name, full: join(rootDir, name) }))
      .filter(({ full }) => {
        try {
          return statSync(full).isDirectory();
        } catch {
          return false;
        }
      })
      .map(({ name: _name, full }) => full);
  } catch {
    return [];
  }

  const rows: HarvestRow[] = [];

  for (const repoDir of repoDirs) {
    const repo = relative(rootDir, repoDir);
    const files = walkRepo(repoDir);

    for (const absPath of files) {
      const relPath = relative(repoDir, absPath);
      // Apply the same skip guards used by the rule
      if (isLowSignalValueFile(relPath)) continue;
      if (isSchemaOrDataFile(relPath)) continue;
      if (isColorTokenDefFile(relPath)) continue;

      let source: string;
      try {
        source = readFileSync(absPath, "utf8");
      } catch {
        continue;
      }

      const ext = extname(absPath).toLowerCase();
      const isCssSource = ext === ".css" || ext === ".scss" || ext === ".sass" || ext === ".less";
      const hits = detectInText(source, relPath, isCssSource);
      for (const hit of hits) {
        if (isInExampleOrSchemaValuePosition(source, hit.index)) continue;
        const line = lineNumberFromIndex(source, hit.index);
        rows.push({
          repo,
          file: relPath,
          line,
          snippet: snippetAround(source, line),
          fileType: extname(absPath).toLowerCase(),
        });
      }
    }
  }

  // Deterministic sort: (repo, file, line)
  rows.sort((a, b) => {
    const r = a.repo.localeCompare(b.repo);
    if (r !== 0) return r;
    const f = a.file.localeCompare(b.file);
    if (f !== 0) return f;
    return a.line - b.line;
  });

  return rows;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const [, , reposDir, outFile] = process.argv;
  if (!reposDir || !outFile) {
    process.stderr.write("Usage: tsx scripts/harvest-color-findings.ts <reposDir> <outFile.jsonl>\n");
    process.exit(1);
  }

  const rows = await collectColorFindings(reposDir);
  const jsonl = rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length > 0 ? "\n" : "");
  await writeFile(outFile, jsonl, "utf8");
  process.stderr.write(`[harvest] wrote ${rows.length} findings → ${outFile}\n`);
}

// Only run main when invoked directly (not when imported by tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    process.stderr.write(String(e) + "\n");
    process.exit(1);
  });
}
