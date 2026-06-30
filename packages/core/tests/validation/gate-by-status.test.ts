import { describe, it, expect } from "vitest";
import { engineGateFailures } from "../../validation/run.js";
import type { EngineReport } from "../../validation/types.js";

const mk = (ruleId: string, j: number): EngineReport["scores"][number] => ({
  ruleId, oracleKind: "construction",
  matrix: { tp: 1, fp: 1, tn: 0, fn: 0 }, youdensJ: j,
  metamorphicInconsistencies: [], mutationsRun: 1,
});

describe("engineGateFailures gates by status", () => {
  it("ignores J<1 for an experimental rule", () => {
    // tokens/no-hardcoded-color is experimental in the catalogue
    const report: EngineReport = { lyseVersion: "x", scores: [mk("tokens/no-hardcoded-color", 0.44)] };
    expect(engineGateFailures(report)).toHaveLength(0);
  });

  it("still fails J<1 for a stable rule", () => {
    // tokens/no-hardcoded-spacing is stable in the catalogue
    const report: EngineReport = { lyseVersion: "x", scores: [mk("tokens/no-hardcoded-spacing", 0.8)] };
    expect(engineGateFailures(report)).toHaveLength(1);
  });
});
