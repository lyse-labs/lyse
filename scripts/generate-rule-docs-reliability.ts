#!/usr/bin/env tsx
/**
 * Splice the auto-generated "Reliability" section (per-class precision from the
 * rules-precision ledger) into each token rule's doc under docs/rules/.
 *
 * Idempotent: only the content between the reliability markers is rewritten.
 * Only the token rules that have a resolvable axis get a section (gradient is
 * excluded — it has no single-value axis).
 *
 * Usage: tsx scripts/generate-rule-docs-reliability.ts
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { axisForRuleId } from "../packages/core/src/reliability/measure/resolve-row-class.js";
import { spliceReliabilitySection } from "../packages/core/src/reliability/measure/rule-docs-reliability.js";
import type { RulePrecisionLedger } from "../packages/core/src/reliability/measure/bucket.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const DOCS_RULES = join(REPO_ROOT, "docs/rules");

/** `tokens-no-hardcoded-color.md` → `tokens/no-hardcoded-color` (else null). */
export function ruleIdForDocFile(fileName: string): string | null {
  const m = /^tokens-(no-hardcoded-.+)\.md$/.exec(fileName);
  return m ? `tokens/${m[1]}` : null;
}

function main(): void {
  const ledgerPath = join(REPO_ROOT, "packages/core/rules-precision.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8")) as RulePrecisionLedger;

  let written = 0;
  for (const fileName of readdirSync(DOCS_RULES).sort()) {
    const ruleId = ruleIdForDocFile(fileName);
    if (ruleId === null || axisForRuleId(ruleId) === null) continue;
    const docPath = join(DOCS_RULES, fileName);
    const before = readFileSync(docPath, "utf8");
    const after = spliceReliabilitySection(before, ruleId, ledger);
    if (after !== before) {
      writeFileSync(docPath, after, "utf8");
      written++;
    }
    process.stderr.write(`[docs] ${ruleId} → ${fileName}\n`);
  }
  process.stderr.write(`[docs] updated ${written} rule doc(s)\n`);
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === join(process.argv[1])) {
  main();
}
