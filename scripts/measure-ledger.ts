#!/usr/bin/env tsx
/**
 * Class-aware precision-ledger orchestrator (P5a run).
 *
 * Runs every rule over a corpus of repos, re-resolves each token finding's
 * drifted literal into a resolution class (exact/near/novel/unresolved),
 * deterministically verifies the `exact` class with `verifyExact`, buckets by
 * (ruleId, class, zone), and writes `packages/core/rules-precision.json`.
 *
 * Only the `exact` bucket is deterministic (no LLM) and therefore the only
 * gate-eligible class. near/novel/unresolved are LLM-judge candidates — counted
 * here but not judged (labelSource "none"), never gate-eligible.
 *
 * IMPORTANT — exact is a *drift* class only for `tokens/no-hardcoded-color`.
 * For the numeric/scale axes (spacing, radii, border-width, opacity, z-index,
 * media-query, typography, shadow, motion) an `exact` value is ON-SCALE =
 * COMPLIANT, so those rules deliberately DO NOT fire on it (see the rule files'
 * `VERDICT_BY_CLASS` docstrings). Their exact bucket is therefore empty by
 * design, not by data shortage.
 *
 * Monorepo app repos ship their own DS package, so Lyse auto-detects them as
 * "self-DS mode" and zones the whole tree ds-source (no app drift). To surface
 * consuming-code drift we write a `.lyse.yaml` naming the detected DS package,
 * which flips dsSelfMode off — exactly how a product team configures Lyse.
 *
 * Usage: tsx scripts/measure-ledger.ts <corpusDir> [--corpus <label>] [--commit <sha>] [--at <iso>]
 */

import { readdirSync, statSync, existsSync, writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { auditDirectory } from "../packages/core/src/commands/audit-pipeline.js";
import { detectFromPackageJson } from "../packages/core/src/detection/from-package-json.js";
import { createResolver } from "../packages/core/src/graph/resolve/index.js";
import {
  aggregateBuckets,
  classifyTokenFinding,
  type LedgerRow,
} from "../packages/core/src/reliability/measure/ledger-aggregate.js";
import { axisForRuleId } from "../packages/core/src/reliability/measure/resolve-row-class.js";
import { buildLedger, serializeLedger } from "../packages/core/src/reliability/measure/ledger.js";
import { gateEligibleFor, type LedgerBucket } from "../packages/core/src/reliability/measure/bucket.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

// The only token rule where `exact` (literal == an existing token) is DRIFT and
// therefore emitted as a finding. The other 9 axes treat exact as on-scale =
// compliant and skip it, so they can never produce an exact-class finding.
const EXACT_DRIFT_RULE = "tokens/no-hardcoded-color";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] !== undefined ? process.argv[i + 1]! : fallback;
}

/**
 * Ensure the repo is audited against its DS (dsSelfMode off) so consuming code
 * is zoned `app` and token drift surfaces. Idempotent; only writes when the repo
 * has no config and auto-detection reports a workspace DS export (self-DS repo).
 */
async function ensureDriftConfig(repoDir: string): Promise<void> {
  if (existsSync(join(repoDir, ".lyse.yaml")) || existsSync(join(repoDir, ".lyse.yml"))) return;
  const detected = await detectFromPackageJson(repoDir);
  const cm = detected.componentsModule;
  if (cm.value && cm.source.startsWith("workspace DS export")) {
    writeFileSync(join(repoDir, ".lyse.yaml"), `designSystem:\n  componentsModule: ${JSON.stringify(cm.value)}\n`, "utf8");
    process.stderr.write(`[measure]   wrote .lyse.yaml componentsModule=${cm.value} (drift surfacing)\n`);
  }
}

async function main(): Promise<void> {
  const corpusDir = process.argv[2];
  if (corpusDir === undefined || corpusDir.startsWith("--")) {
    console.error("Usage: tsx scripts/measure-ledger.ts <corpusDir> [--corpus <label>] [--commit <sha>] [--at <iso>]");
    process.exit(1);
  }
  const corpusLabel = arg("--corpus", corpusDir);
  const commit = arg("--commit", "unknown");
  const measuredAt = arg("--at", new Date().toISOString());

  const repoDirs = readdirSync(corpusDir)
    .map((name) => ({ name, full: join(corpusDir, name) }))
    .filter(({ full }) => {
      try {
        return statSync(full).isDirectory();
      } catch {
        return false;
      }
    });

  const rows: LedgerRow[] = [];
  const skippedNoLiteral = new Map<string, number>();
  const colorRuleFired = { value: false };
  let totalFindings = 0;
  let tokenFindings = 0;

  for (const { name: repo, full: repoDir } of repoDirs) {
    process.stderr.write(`[measure] auditing ${repo}…\n`);
    await ensureDriftConfig(repoDir);
    let pipeline;
    try {
      pipeline = await auditDirectory(repoDir, { staticOnly: true });
    } catch (e) {
      process.stderr.write(`[measure]   skipped ${repo}: ${String(e)}\n`);
      continue;
    }
    const resolver = createResolver(pipeline.graph);

    for (const f of pipeline.result.findings) {
      totalFindings++;
      if (axisForRuleId(f.ruleId) === null) continue;
      tokenFindings++;
      if (f.ruleId === EXACT_DRIFT_RULE) colorRuleFired.value = true;
      const literal = f.fixGroup?.from;
      if (literal === undefined || literal === "") {
        skippedNoLiteral.set(f.ruleId, (skippedNoLiteral.get(f.ruleId) ?? 0) + 1);
        continue;
      }
      const row = classifyTokenFinding(f.ruleId, f.location.file, f.location.line, literal, pipeline.graph, resolver);
      if (row !== null) rows.push(row);
    }
  }

  const drafts = aggregateBuckets(rows);

  // If the colour rule ran but produced no exact-class drift, record the
  // empirical zero explicitly (exact/app N=0) — it IS the headline answer for
  // the one axis where exact is a drift class.
  const hasColorExactApp = drafts.some(
    (b) => b.ruleId === EXACT_DRIFT_RULE && b.class === "exact" && b.zone === "app",
  );
  if (colorRuleFired.value && !hasColorExactApp) {
    drafts.push({
      ruleId: EXACT_DRIFT_RULE,
      class: "exact",
      zone: "app",
      n: 0,
      precision: null,
      precisionWilsonLB: null,
      recall: null,
      recallWilsonLB: null,
      labelSource: "none",
    });
  }

  const ledger = buildLedger(drafts, { corpus: corpusLabel, commit, measuredAt });
  const outPath = join(REPO_ROOT, "packages/core/rules-precision.json");
  await writeFile(outPath, serializeLedger(ledger), "utf8");

  // Human-readable summary to stderr.
  process.stderr.write(`\n[measure] repos=${repoDirs.length} totalFindings=${totalFindings} tokenFindings=${tokenFindings} ledgerRows=${rows.length}\n`);
  if (skippedNoLiteral.size > 0) {
    process.stderr.write(`[measure] skipped (no fixGroup.from literal):\n`);
    for (const [ruleId, n] of [...skippedNoLiteral].sort()) {
      process.stderr.write(`[measure]   ${ruleId}: ${n}\n`);
    }
  }
  process.stderr.write(`\n[measure] EXACT/app buckets (the only gate-eligible class):\n`);
  const exactApp = ledger.buckets.filter((b: LedgerBucket) => b.class === "exact" && b.zone === "app");
  if (exactApp.length === 0) process.stderr.write(`[measure]   (none — no exact-class drift observed)\n`);
  for (const b of exactApp.sort((a, c) => a.ruleId.localeCompare(c.ruleId))) {
    const lb = b.precisionWilsonLB !== null ? b.precisionWilsonLB.toFixed(3) : "—";
    const p = b.precision !== null ? (b.precision * 100).toFixed(1) + "%" : "—";
    process.stderr.write(
      `[measure]   ${b.ruleId}: N=${b.n} precision=${p} wilsonLB=${lb} gateEligible=${b.gateEligible} (recheck=${gateEligibleFor(b)})\n`,
    );
  }
  process.stderr.write(`\n[measure] all buckets by (rule, class):\n`);
  const byRuleClass = new Map<string, number>();
  for (const b of ledger.buckets) {
    const k = `${b.ruleId} · ${b.class}`;
    byRuleClass.set(k, (byRuleClass.get(k) ?? 0) + b.n);
  }
  for (const [k, n] of [...byRuleClass].sort()) process.stderr.write(`[measure]   ${k}: ${n}\n`);
  process.stderr.write(`\n[measure] wrote ${outPath}\n`);
}

main().catch((e) => {
  process.stderr.write(String(e) + "\n");
  process.exit(1);
});
