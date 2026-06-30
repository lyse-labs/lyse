#!/usr/bin/env tsx
/**
 * Generalized harvest harness — run ALL rules over a directory of repos,
 * emit each finding with surrounding source context and ruleId.
 *
 * CLI:
 *   tsx scripts/harvest-findings.ts <corpusDir> <outDir>
 *
 * Writes one JSONL file per rule: <outDir>/<ruleId-slug>.jsonl
 * where the slug is the ruleId with "/" replaced by "__".
 *
 * Exported API:
 *   collectAllFindings(rootDir: string): Promise<FindingRow[]>
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { auditDirectory } from "../packages/core/src/commands/audit-pipeline.js";
import {
  populateConfidence,
  buildClassifyContext,
} from "../packages/core/src/codemods/safety.js";
import type { Confidence } from "../packages/core/src/types.js";

export interface FindingRow {
  ruleId: string;
  repo: string;
  file: string;
  line: number;
  snippet: string;
  fileType: string;
  confidence: Confidence;
  /** Original finding message — required by row-aware verifiers (e.g. stories/props-documented). */
  message?: string;
}

function snippetAround(source: string, lineNum: number): string {
  const lines = source.split("\n");
  const start = Math.max(0, lineNum - 3);
  const end = Math.min(lines.length, lineNum + 2);
  return lines.slice(start, end).join("\n");
}

export async function collectAllFindings(rootDir: string): Promise<FindingRow[]> {
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

  const rows: FindingRow[] = [];

  for (const { name: repo, full: repoDir } of repoDirs) {
    let pipelineResult;
    try {
      pipelineResult = await auditDirectory(repoDir, { staticOnly: true });
    } catch {
      continue;
    }

    const ctx = buildClassifyContext(
      pipelineResult.result.findings,
      pipelineResult.tokens,
      pipelineResult.config,
      repoDir,
    );
    const enrichedResult = populateConfidence(pipelineResult.result, ctx);

    for (const f of enrichedResult.findings) {
      // Virtual files (e.g. "(inventory)") have no on-disk source — emit the
      // row with an empty snippet instead of skipping the finding entirely.
      const isVirtual = f.location.file.startsWith("(");
      let snippet = "";
      if (!isVirtual) {
        const absPath = join(repoDir, f.location.file);
        try {
          const source = readFileSync(absPath, "utf8");
          snippet = snippetAround(source, f.location.line);
        } catch {
          continue;
        }
      }

      const fileType = f.location.file.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? "";
      rows.push({
        ruleId: f.ruleId,
        repo,
        file: f.location.file,
        line: f.location.line,
        snippet,
        fileType,
        confidence: f.confidence ?? "high",
        message: f.message,
      });
    }
  }

  rows.sort((a, b) => {
    const r = a.ruleId.localeCompare(b.ruleId);
    if (r !== 0) return r;
    const repo = a.repo.localeCompare(b.repo);
    if (repo !== 0) return repo;
    const f = a.file.localeCompare(b.file);
    if (f !== 0) return f;
    return a.line - b.line;
  });

  return rows;
}

async function main(): Promise<void> {
  const [, , corpusDir, outDir] = process.argv;
  if (!corpusDir || !outDir) {
    process.stderr.write(
      "Usage: tsx scripts/harvest-findings.ts <corpusDir> <outDir>\n",
    );
    process.exit(1);
  }

  const rows = await collectAllFindings(corpusDir);

  const byRule = new Map<string, FindingRow[]>();
  for (const row of rows) {
    const bucket = byRule.get(row.ruleId) ?? [];
    bucket.push(row);
    byRule.set(row.ruleId, bucket);
  }

  await mkdir(outDir, { recursive: true });

  for (const [ruleId, ruleRows] of byRule) {
    const slug = ruleId.replaceAll("/", "__");
    const outFile = join(outDir, `${slug}.jsonl`);
    const jsonl =
      ruleRows.map((r) => JSON.stringify(r)).join("\n") +
      (ruleRows.length > 0 ? "\n" : "");
    await writeFile(outFile, jsonl, "utf8");
  }

  process.stderr.write(
    `[harvest] wrote ${rows.length} findings across ${byRule.size} rules → ${outDir}\n`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    process.stderr.write(String(e) + "\n");
    process.exit(1);
  });
}
