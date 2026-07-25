#!/usr/bin/env tsx
/**
 * Seeded-drift recall orchestrator.
 *
 * Runs `measureRecall()` over the built-in seeded-drift fixture corpus
 * (`reliability/recall/fixtures.ts`) — for each fixture, injects generated
 * literals of a known resolution class (exact/near/novel) into a component
 * and checks whether the target rule catches them — then buckets by
 * (ruleId, class, zone) and writes `packages/core/rules-recall.json`.
 *
 * Usage: tsx scripts/measure-recall.ts [--commit <sha>] [--at <iso>]
 */

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { measureRecall } from "../packages/core/src/reliability/recall/measure-recall.js";
import type { RecallBucket, RecallLedger } from "../packages/core/src/reliability/recall/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] !== undefined ? process.argv[i + 1]! : fallback;
}

function byKey(a: RecallBucket, b: RecallBucket): number {
  if (a.ruleId !== b.ruleId) return a.ruleId < b.ruleId ? -1 : 1;
  if (a.class !== b.class) return a.class < b.class ? -1 : 1;
  if (a.zone !== b.zone) return a.zone < b.zone ? -1 : 1;
  return 0;
}

async function main(): Promise<void> {
  const commit = arg("--commit", "unknown");
  // Deliberate deviation from measure-ledger.ts's `new Date()` default: this
  // artifact must be byte-identical across runs with no args (Global
  // Constraint), so the fallback is a fixed epoch, not a live clock.
  const measuredAt = arg("--at", "1970-01-01T00:00:00.000Z");

  const buckets = (await measureRecall()).slice().sort(byKey);

  const ledger: RecallLedger = {
    schemaVersion: 1,
    recallGeneratedFrom: { source: "seeded-drift fixtures", commit, measuredAt },
    buckets,
  };

  const outPath = join(REPO_ROOT, "packages/core/rules-recall.json");
  writeFileSync(outPath, JSON.stringify(ledger, null, 2) + "\n", "utf8");

  process.stderr.write(`\n[measure-recall] buckets=${buckets.length}\n`);
  for (const b of buckets) {
    const recall = b.recall !== null ? (b.recall * 100).toFixed(1) + "%" : "—";
    const lb = b.recallWilsonLB !== null ? b.recallWilsonLB.toFixed(3) : "—";
    process.stderr.write(
      `[measure-recall]   ${b.ruleId} · ${b.class} · ${b.zone}: caught=${b.caught}/${b.seeded} recall=${recall} wilsonLB=${lb}\n`,
    );
  }
  process.stderr.write(`\n[measure-recall] wrote ${outPath}\n`);
}

main().catch((e) => {
  process.stderr.write(String(e) + "\n");
  process.exit(1);
});
