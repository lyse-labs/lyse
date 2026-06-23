import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { VERSION } from "../src/index.js";
import { evaluateAdapter } from "./run-adapter.js";
import { adapters as allAdapters } from "./adapters/index.js";
import type { OracleAdapter, EngineReport, RuleScore } from "./types.js";

export async function runAll(list: OracleAdapter[] = allAdapters): Promise<EngineReport> {
  const scores: RuleScore[] = [];
  for (const adapter of list) {
    scores.push(await evaluateAdapter(adapter));
  }
  scores.sort((a, b) => (a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0));
  return { lyseVersion: VERSION, scores };
}

export function engineGateFailures(report: EngineReport): RuleScore[] {
  return report.scores.filter(
    (s) => s.youdensJ < 1 || s.metamorphicInconsistencies.length > 0,
  );
}

// CLI entry: `tsx validation/run.ts` — deterministic, zero LLM.
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = await runAll();
  const here = dirname(fileURLToPath(import.meta.url));
  writeFileSync(join(here, "report.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  for (const s of report.scores) {
    const flags: string[] = [];
    if (s.matrix.fn > 0) flags.push(`${s.matrix.fn} missed`);
    if (s.matrix.fp > 0) flags.push(`${s.matrix.fp} false-positive`);
    if (s.metamorphicInconsistencies.length) flags.push(`${s.metamorphicInconsistencies.length} inconsistency`);
    process.stdout.write(
      `${s.ruleId.padEnd(40)} J=${s.youdensJ.toFixed(3)}  ${flags.join(", ") || "clean"}\n`,
    );
  }
  const failures = engineGateFailures(report);
  if (failures.length > 0) {
    process.stderr.write(
      `ENGINE GATE FAILED: ${failures.length} rule(s) below J=1 or metamorphically inconsistent\n`,
    );
    for (const f of failures) {
      process.stderr.write(`  ${f.ruleId}  J=${f.youdensJ.toFixed(3)}\n`);
    }
    process.exitCode = 1;
  } else {
    process.stderr.write(
      `ENGINE GATE PASS: ${report.scores.length} rules, all J=1, no inconsistencies\n`,
    );
  }
}
