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
 *   5. buildReport → write .superpowers/measurement-report.{md,json}
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
import {
  AgentCliAdapter,
  isAgentCliAvailable,
} from "../packages/core/src/llm/connectors/agent-cli-adapter.js";
import type { ConnectorClient } from "../packages/core/src/llm/connectors/types.js";
import { NoopAdapter } from "../packages/core/src/llm/connectors/noop-adapter.js";
import { ruleObjects } from "../packages/core/src/rules/registry.js";

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

const DEFAULT_CAP = 40;

function sampleFindings(rows: FindingRow[], cap: number): FindingRow[] {
  if (rows.length <= cap) return rows;
  // Even-stride deterministic sampling across the sorted list.
  const stride = rows.length / cap;
  const sampled: FindingRow[] = [];
  for (let i = 0; i < cap; i++) {
    const idx = Math.floor(i * stride);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    sampled.push(rows[idx]!);
  }
  return sampled;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  let corpusDir: string | undefined;
  let cap = DEFAULT_CAP;
  let structuralOnly = process.env["MEASURE_STRUCTURAL_ONLY"] === "1";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--cap" && i + 1 < args.length) {
      const parsed = Number(args[++i]);
      if (Number.isFinite(parsed) && parsed > 0) cap = Math.floor(parsed);
    } else if (arg === "--structural-only") {
      structuralOnly = true;
    } else if (arg !== undefined && !arg.startsWith("--")) {
      corpusDir = arg;
    }
  }

  const capFromEnv = Number(process.env["MEASURE_CAP"] ?? "");
  if (Number.isFinite(capFromEnv) && capFromEnv > 0) cap = Math.floor(capFromEnv);

  if (corpusDir === undefined || corpusDir === "") {
    console.error("Usage: tsx scripts/measure-rules.ts <corpusDir> [--cap N] [--structural-only]");
    process.exit(1);
  }

  // Resolve connector: prefer agent-cli (claude on PATH), degrade to Noop.
  let connector: ConnectorClient;
  let connectorDesc: string;
  if (isAgentCliAvailable()) {
    connector = new AgentCliAdapter({ model: "claude-haiku-4-5" });
    connectorDesc = "agent-cli (claude haiku)";
  } else {
    connector = new NoopAdapter();
    connectorDesc = "noop (claude CLI not available — detection rules will be pending-human)";
  }
  console.log(`Connector: ${connectorDesc}`);
  if (structuralOnly) {
    console.log("Mode: structural-only (detection rules skipped — LLM judging deferred)");
  }

  console.log(`Harvesting findings from: ${corpusDir}`);
  console.log(`Detection sampling cap: ${cap} (${structuralOnly ? "not applied — structural-only mode" : "applied to detection rules"})`);
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
        // Exclude needs-verifier labels from precision counts — these findings
        // have no real verifier so they are UNMEASURED, not false-positives.
        if (label.reason === "needs-verifier") continue;
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

    // detection — LLM judge (capped sample)
    if (structuralOnly) {
      measurements.push({
        ruleId,
        kind,
        nSamples: 0,
        nTotal: rows.length,
        precisionMeasured: null,
        precisionWilsonLowerBound: null,
        recallSynthetic: syntheticRecall.get(ruleId) ?? null,
        labelSource: "none",
        verdict: "not-measured",
      });
      continue;
    }
    const nTotal = rows.length;
    const sampledRows = sampleFindings(rows, cap);
    console.log(`  [detection] ${ruleId}: judging ${sampledRows.length}/${nTotal} findings…`);
    const labelMap: Map<FindingRow, JudgeLabel> = await judgeFindings(sampledRows, { connector });

    let tp = 0;
    let fp = 0;
    const uncertainRows: { row: FindingRow; label: JudgeLabel }[] = [];

    for (const row of sampledRows) {
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

    const measurement: RuleMeasurement = {
      ruleId,
      kind,
      nSamples,
      precisionMeasured,
      precisionWilsonLowerBound: nSamples > 0 ? wilsonLowerBound(tp, nSamples) : null,
      recallSynthetic: syntheticRecall.get(ruleId) ?? null,
      labelSource: nSamples > 0 ? "llm-provisional" : "none",
      verdict: "not-measured",
    };
    if (nTotal > sampledRows.length) measurement.nTotal = nTotal;
    measurements.push(measurement);
  }

  // Add registry rules that produced zero findings (not in byRule).
  const measuredIds = new Set(measurements.map((m) => m.ruleId));
  for (const rule of ruleObjects) {
    if (measuredIds.has(rule.id)) continue;
    let kind: ReturnType<typeof measureKindOf>;
    try {
      kind = measureKindOf(rule.id);
    } catch {
      continue;
    }
    measurements.push({
      ruleId: rule.id,
      kind,
      nSamples: 0,
      precisionMeasured: null,
      precisionWilsonLowerBound: null,
      recallSynthetic: syntheticRecall.get(rule.id) ?? null,
      labelSource: "none",
      verdict: "not-measured",
    });
  }

  const { md: rawMd, json } = buildReport(measurements);

  const partialNote = structuralOnly
    ? [
        "> **PARTIAL RUN — structural-only mode**: detection rules were not LLM-judged in this run.",
        "> Their findings were harvested (see `nTotal`) but judging was deferred (LLM call latency too high",
        "> for a full synchronous run). Re-run without `--structural-only` to judge detection rules.",
        "> All detection-rule entries show `not-measured`.",
        "",
      ].join("\n")
    : "";

  const md = partialNote + rawMd;

  const outDir = join(REPO_ROOT, ".superpowers");
  if (!existsSync(outDir)) {
    await mkdir(outDir, { recursive: true });
  }

  await writeFile(join(outDir, "measurement-report.md"), md, "utf8");
  await writeFile(join(outDir, "measurement-report.json"), JSON.stringify(json, null, 2) + "\n", "utf8");

  console.log(`\nReport written to .superpowers/measurement-report.{md,json}`);
  const promotable = json.filter((m) => m.verdict === "promotable").length;
  const pendingHuman = json.filter((m) => m.verdict === "pending-human").length;
  const walled = json.filter((m) => m.verdict === "walled").length;
  const notMeasured = json.filter((m) => m.verdict === "not-measured").length;
  const capped = json.filter((m) => m.nTotal !== undefined && m.nTotal > m.nSamples).length;
  console.log(`  promotable: ${promotable}`);
  console.log(`  pending-human: ${pendingHuman}`);
  console.log(`  walled: ${walled}`);
  console.log(`  not-measured: ${notMeasured}`);
  if (capped > 0) {
    console.log(`  detection rules capped at ${cap}: ${capped}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
