#!/usr/bin/env tsx
/**
 * Measurement campaign orchestrator.
 *
 * Usage:
 *   tsx scripts/measure-rules.ts <corpusDir>
 *
 * Steps:
 *   1. collectAllFindings(corpusDir) — run all rules over bench corpus
 *   2. Group findings by ruleId
 *   3. Route by measureKindOf:
 *      - structural  → autoLabel each finding → aggregate precision
 *      - detection   → judgeFindings (LLM) → aggregate precision
 *      - render-only → skip, verdict=not-measured
 *   4. Pull synthetic recall from validation/report.json
 *   5. buildReport → write docs/superpowers/measurement-report.{md,json}
 *   6. Write per-rule human review packets to .bench-corpus/packets/<rule>.md
 */

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { collectAllFindings } from "./harvest-findings.js";
import type { FindingRow } from "./harvest-findings.js";
import { measureKindOf } from "../packages/core/src/reliability/measure/rule-measure-kind.js";
import { autoLabel } from "../packages/core/src/reliability/measure/auto-label.js";
import { judgeFindings, packetFor } from "../packages/core/src/reliability/measure/judge.js";
import type { JudgeLabel } from "../packages/core/src/reliability/measure/judge.js";
import { wilsonLowerBound } from "../packages/core/src/reliability/catalogue/promotion.js";
import { buildReport } from "../packages/core/src/reliability/measure/report.js";
import type { RuleMeasurement } from "../packages/core/src/reliability/measure/report.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

interface ValidationScore {
  ruleId: string;
  matrix: { tp: number; fp: number; tn: number; fn: number };
  youdensJ: number;
}

interface ValidationReport {
  scores: ValidationScore[];
}

async function loadSyntheticRecall(): Promise<Map<string, number>> {
  const reportPath = join(REPO_ROOT, "packages/core/validation/report.json");
  const raw = await readFile(reportPath, "utf8");
  const report = JSON.parse(raw) as ValidationReport;
  const map = new Map<string, number>();
  for (const score of report.scores) {
    const { tp, fn } = score.matrix;
    const total = tp + fn;
    if (total > 0) {
      map.set(score.ruleId, tp / total);
    }
  }
  return map;
}

async function main(): Promise<void> {
  const corpusDir = process.argv[2];
  if (corpusDir === undefined || corpusDir === "") {
    console.error("Usage: tsx scripts/measure-rules.ts <corpusDir>");
    process.exit(1);
  }

  console.log(`Harvesting findings from: ${corpusDir}`);
  const allRows = await collectAllFindings(corpusDir);
  console.log(`Found ${allRows.length} total findings`);

  // Group by ruleId
  const byRule = new Map<string, FindingRow[]>();
  for (const row of allRows) {
    if (!byRule.has(row.ruleId)) byRule.set(row.ruleId, []);
    byRule.get(row.ruleId)!.push(row);
  }

  // Load synthetic recall baseline
  const syntheticRecall = await loadSyntheticRecall();

  // Aggregate per rule
  const measurements: RuleMeasurement[] = [];
  const packetsDir = join(REPO_ROOT, ".bench-corpus/packets");

  for (const [ruleId, rows] of [...byRule.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    let kind: ReturnType<typeof measureKindOf>;
    try {
      kind = measureKindOf(ruleId);
    } catch {
      console.warn(`Skipping unclassified rule: ${ruleId}`);
      continue;
    }

    if (kind === "render-only") {
      measurements.push({
        ruleId,
        kind,
        nSamples: 0,
        precisionMeasured: null,
        precisionWilsonLowerBound: null,
        recallSynthetic: syntheticRecall.get(ruleId) ?? null,
        labelSource: "none",
        verdict: "not-measured",
      });
      continue;
    }

    if (kind === "structural") {
      let tp = 0;
      let fp = 0;
      for (const row of rows) {
        // autoLabel needs a real repoDir — derive from the corpus
        const repoDir = join(corpusDir, row.repo);
        const label = autoLabel(row, repoDir);
        if (label.verdict === "tp") tp++;
        else fp++;
      }
      const nSamples = tp + fp;
      const precisionMeasured = nSamples > 0 ? tp / nSamples : null;
      measurements.push({
        ruleId,
        kind,
        nSamples,
        precisionMeasured,
        precisionWilsonLowerBound: nSamples > 0 ? wilsonLowerBound(tp, nSamples) : null,
        recallSynthetic: syntheticRecall.get(ruleId) ?? null,
        labelSource: nSamples > 0 ? "auto" : "none",
        verdict: "not-measured",
      });
      continue;
    }

    // detection — LLM judge
    const labelMap: Map<FindingRow, JudgeLabel> = await judgeFindings(rows);

    let tp = 0;
    let fp = 0;
    const uncertainRows: { row: FindingRow; label: JudgeLabel }[] = [];

    for (const row of rows) {
      const label = labelMap.get(row);
      if (label === undefined) continue;
      if (label.verdict === "tp") tp++;
      else if (label.verdict === "fp") fp++;
      else uncertainRows.push({ row, label });
    }

    const nSamples = tp + fp;
    const precisionMeasured = nSamples > 0 ? tp / nSamples : null;

    // Write human review packet for uncertain rows
    if (uncertainRows.length > 0) {
      const packet = packetFor(ruleId, uncertainRows);
      const slug = ruleId.replace(/\//g, "__");
      await mkdir(packetsDir, { recursive: true });
      await writeFile(join(packetsDir, `${slug}.md`), packet, "utf8");
    }

    measurements.push({
      ruleId,
      kind,
      nSamples,
      precisionMeasured,
      precisionWilsonLowerBound: nSamples > 0 ? wilsonLowerBound(tp, nSamples) : null,
      recallSynthetic: syntheticRecall.get(ruleId) ?? null,
      labelSource: nSamples > 0 ? "llm-provisional" : "none",
      verdict: "not-measured",
    });
  }

  // Also add rules that have no findings (not-measured)
  // (already covered via byRule loop — they simply don't appear)

  const { md, json } = buildReport(measurements);

  const outDir = join(REPO_ROOT, "docs/superpowers");
  if (!existsSync(outDir)) {
    await mkdir(outDir, { recursive: true });
  }

  await writeFile(join(outDir, "measurement-report.md"), md, "utf8");
  await writeFile(join(outDir, "measurement-report.json"), JSON.stringify(json, null, 2) + "\n", "utf8");

  console.log(`\nReport written to docs/superpowers/measurement-report.{md,json}`);
  const promotable = json.filter((m) => m.verdict === "promotable").length;
  const pendingHuman = json.filter((m) => m.verdict === "pending-human").length;
  const walled = json.filter((m) => m.verdict === "walled").length;
  const notMeasured = json.filter((m) => m.verdict === "not-measured").length;
  console.log(`  promotable: ${promotable}`);
  console.log(`  pending-human: ${pendingHuman}`);
  console.log(`  walled: ${walled}`);
  console.log(`  not-measured: ${notMeasured}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
