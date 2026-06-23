import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { VERSION } from "../src/index.js";
import { RenderUnavailableError } from "../src/render/types.js";
import { evaluateRenderAdapter } from "./render-adapters.js";
import { evaluateAxeAdapter } from "./axe-adapters.js";
import { engineGateFailures } from "./run.js";
import type { EngineReport, RuleScore } from "./types.js";

/** Execution-oracle adapters the render lane runs by default. Each needs Chromium. */
export const renderLaneAdapters: Array<() => Promise<RuleScore>> = [
  evaluateRenderAdapter,
  evaluateAxeAdapter,
];

export type RenderLaneOutcome =
  | { status: "ran"; report: EngineReport }
  | { status: "skipped"; reason: string };

/**
 * Runs the execution-oracle adapters (real Chromium) and assembles an
 * EngineReport, mirroring the static runner (run.ts) but for the render lane.
 *
 * Returns { status: "skipped" } when Chromium/Playwright is unavailable so the
 * lane degrades gracefully off-CI; any other adapter failure rethrows. The
 * caller decides whether a skip is fatal (LYSE_RENDER_REQUIRED=1) or tolerated.
 */
export async function runRenderLane(
  adapters: Array<() => Promise<RuleScore>> = renderLaneAdapters,
): Promise<RenderLaneOutcome> {
  const scores: RuleScore[] = [];
  for (const adapter of adapters) {
    try {
      scores.push(await adapter());
    } catch (e) {
      if (e instanceof RenderUnavailableError) {
        return { status: "skipped", reason: e.message };
      }
      throw e;
    }
  }
  scores.sort((a, b) => (a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0));
  return { status: "ran", report: { lyseVersion: VERSION, scores } };
}

// CLI entry: `tsx validation/render-lane.ts` — execution oracle, real Chromium.
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const required = process.env.LYSE_RENDER_REQUIRED === "1";
  const outcome = await runRenderLane();

  if (outcome.status === "skipped") {
    if (required) {
      process.stderr.write(
        `RENDER LANE FAILED: render required but Chromium unavailable — ${outcome.reason}\n`,
      );
      process.exitCode = 1;
    } else {
      process.stderr.write(
        `RENDER LANE SKIPPED: ${outcome.reason}\n` +
          `  (set LYSE_RENDER_REQUIRED=1 to make this a hard failure — CI does)\n`,
      );
    }
  } else {
    const here = dirname(fileURLToPath(import.meta.url));
    writeFileSync(
      join(here, "render-report.json"),
      JSON.stringify(outcome.report, null, 2) + "\n",
      "utf8",
    );
    for (const s of outcome.report.scores) {
      const flags: string[] = [];
      if (s.matrix.fn > 0) flags.push(`${s.matrix.fn} missed`);
      if (s.matrix.fp > 0) flags.push(`${s.matrix.fp} false-positive`);
      process.stdout.write(
        `${s.ruleId.padEnd(40)} J=${s.youdensJ.toFixed(3)}  ${flags.join(", ") || "clean"}\n`,
      );
    }
    const failures = engineGateFailures(outcome.report);
    if (failures.length > 0) {
      process.stderr.write(
        `RENDER LANE GATE FAILED: ${failures.length} rule(s) below J=1\n`,
      );
      for (const f of failures) {
        process.stderr.write(`  ${f.ruleId}  J=${f.youdensJ.toFixed(3)}\n`);
      }
      process.exitCode = 1;
    } else {
      process.stderr.write(
        `RENDER LANE GATE PASS: ${outcome.report.scores.length} execution-oracle rules, all J=1\n`,
      );
    }
  }
}
