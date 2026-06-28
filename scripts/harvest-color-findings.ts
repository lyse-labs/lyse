#!/usr/bin/env tsx
/**
 * Harvest harness — run tokens/no-hardcoded-color over a directory of repos,
 * emit each finding with surrounding source context.
 *
 * Uses the real `auditDirectory` pipeline (staticOnly) so every guard in the
 * rule's evaluate() applies — including isVendoredOrResetFile, isSvgIconContext,
 * isBuiltinExcludedPath, isDataPaletteContext, etc. Output equals what
 * `lyse audit --rule tokens/no-hardcoded-color` would report.
 *
 * Usage (CLI):
 *   tsx scripts/harvest-color-findings.ts <reposDir> <outFile.jsonl>
 *
 * Exported API:
 *   collectColorFindings(rootDir: string): Promise<HarvestRow[]>
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { auditDirectory } from "../packages/core/src/commands/audit-pipeline.js";
import { populateConfidence, buildClassifyContext } from "../packages/core/src/codemods/safety.js";
import type { Confidence } from "../packages/core/src/types.js";

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
  /** AST-confidence grade from the safety dispatcher (high/medium/low). */
  confidence: Confidence;
}

// ---------------------------------------------------------------------------
// Snippet helper
// ---------------------------------------------------------------------------

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
 *
 * Uses the real auditDirectory pipeline (staticOnly: true) so output is
 * identical to `lyse audit --static-only` filtered to this rule.
 */
export async function collectColorFindings(rootDir: string): Promise<HarvestRow[]> {
  let repoDirs: { name: string; full: string }[];
  try {
    repoDirs = readdirSync(rootDir)
      .map((name) => ({ name, full: join(rootDir, name) }))
      .filter(({ full }) => {
        try {
          return statSync(full).isDirectory();
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }

  const rows: HarvestRow[] = [];

  for (const { name: repo, full: repoDir } of repoDirs) {
    let pipelineResult;
    try {
      pipelineResult = await auditDirectory(repoDir, { staticOnly: true });
    } catch {
      // Unreadable repo or pipeline error — skip this repo
      continue;
    }

    // Populate confidence on all findings using the safety dispatcher.
    // auditDirectory does NOT call populateConfidence — that's done downstream
    // in the CLI. We call it here so each HarvestRow carries the AST-graded
    // confidence field for measurement.
    const ctx = buildClassifyContext(
      pipelineResult.result.findings,
      pipelineResult.tokens,
      pipelineResult.config,
      repoDir,
    );
    const enrichedResult = populateConfidence(pipelineResult.result, ctx);

    const colorFindings = enrichedResult.findings.filter(
      (f) => f.ruleId === "tokens/no-hardcoded-color",
    );

    for (const f of colorFindings) {
      const absPath = join(repoDir, f.location.file);
      let source: string;
      try {
        source = readFileSync(absPath, "utf8");
      } catch {
        continue;
      }

      const fileType = f.location.file.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? "";
      rows.push({
        repo,
        file: f.location.file,
        line: f.location.line,
        snippet: snippetAround(source, f.location.line),
        fileType,
        confidence: f.confidence ?? "high",
      });
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
