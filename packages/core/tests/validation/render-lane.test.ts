import { describe, it, expect } from "vitest";
import { runRenderLane } from "../../validation/render-lane.js";
import { engineGateFailures } from "../../validation/run.js";
import { evaluateRenderAdapter } from "../../validation/render-adapters.js";
import { evaluateAxeAdapter } from "../../validation/axe-adapters.js";
import { EXECUTION_COVERED } from "../../validation/coverage.js";
import { RenderUnavailableError } from "../../src/render/types.js";
import { emptyMatrix } from "../../validation/score.js";
import type { RuleScore } from "../../validation/types.js";

const j1Score = (ruleId: string): RuleScore => ({
  ruleId,
  oracleKind: "execution",
  matrix: { tp: 1, fp: 0, tn: 1, fn: 0 },
  youdensJ: 1,
  metamorphicInconsistencies: [],
  mutationsRun: 1,
});

describe("render-lane runner", () => {
  it("assembles an EngineReport from succeeding adapters, sorted by ruleId", async () => {
    const outcome = await runRenderLane([
      () => Promise.resolve(j1Score("z/second")),
      () => Promise.resolve(j1Score("a/first")),
    ]);
    expect(outcome.status).toBe("ran");
    if (outcome.status !== "ran") throw new Error("unreachable");
    expect(outcome.report.scores.map((s) => s.ruleId)).toEqual(["a/first", "z/second"]);
    expect(engineGateFailures(outcome.report)).toHaveLength(0);
  });

  it("skips when an adapter throws RenderUnavailableError", async () => {
    const outcome = await runRenderLane([
      () => Promise.reject(new RenderUnavailableError("no chromium")),
      () => Promise.resolve(j1Score("a/first")),
    ]);
    expect(outcome.status).toBe("skipped");
    if (outcome.status !== "skipped") throw new Error("unreachable");
    expect(outcome.reason).toContain("no chromium");
  });

  it("rethrows non-availability errors", async () => {
    await expect(
      runRenderLane([() => Promise.reject(new Error("boom"))]),
    ).rejects.toThrow("boom");
  });

  it("engineGateFailures flags a sub-J=1 execution score", async () => {
    const bad: RuleScore = {
      ruleId: "a11y/runtime-axe",
      oracleKind: "execution",
      matrix: { ...emptyMatrix(), fn: 1, tp: 0 },
      youdensJ: 0.5,
      metamorphicInconsistencies: [],
      mutationsRun: 1,
    };
    const outcome = await runRenderLane([() => Promise.resolve(bad)]);
    expect(outcome.status).toBe("ran");
    if (outcome.status !== "ran") throw new Error("unreachable");
    expect(engineGateFailures(outcome.report)).toHaveLength(1);
  });

  it("default adapters cover exactly the EXECUTION_COVERED rules", async () => {
    // Real execution oracle — needs Chromium; skips cleanly when absent.
    let outcome;
    try {
      outcome = await runRenderLane();
    } catch (e) {
      if (e instanceof RenderUnavailableError) return;
      throw e;
    }
    if (outcome.status === "skipped") return;
    const laneRuleIds = outcome.report.scores.map((s) => s.ruleId).sort();
    expect(laneRuleIds).toEqual(Object.keys(EXECUTION_COVERED).sort());
    for (const s of outcome.report.scores) {
      expect(s.youdensJ).toBe(1);
    }
  }, 90_000);
});

// Guard: the default adapter set the lane ships with must equal the two
// execution-covered rules — keeps render-lane.ts and coverage.ts in sync.
describe("render-lane / coverage parity", () => {
  it("EXECUTION_COVERED keys match the shipped execution adapters", async () => {
    const shipped = await Promise.all(
      [evaluateRenderAdapter, evaluateAxeAdapter].map(async (fn) => {
        try {
          return (await fn()).ruleId;
        } catch (e) {
          if (e instanceof RenderUnavailableError) return null;
          throw e;
        }
      }),
    );
    const resolved = shipped.filter((x): x is string => x !== null);
    // When Chromium is present, every shipped adapter's ruleId must be declared
    // in EXECUTION_COVERED (and vice versa).
    if (resolved.length === 2) {
      expect(resolved.sort()).toEqual(Object.keys(EXECUTION_COVERED).sort());
    }
  }, 90_000);
});
