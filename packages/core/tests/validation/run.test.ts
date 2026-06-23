import { describe, it, expect } from "vitest";
import { runAll, engineGateFailures } from "../../validation/run.js";
import { colorAdapter } from "../../validation/adapters/tokens-no-hardcoded-color.js";
import type { EngineReport, RuleScore } from "../../validation/types.js";

function makeScore(overrides: Partial<RuleScore> = {}): RuleScore {
  return {
    ruleId: "test/rule",
    oracleKind: "construction",
    matrix: { tp: 1, fp: 0, tn: 1, fn: 0 },
    youdensJ: 1,
    metamorphicInconsistencies: [],
    mutationsRun: 1,
    ...overrides,
  };
}

function makeReport(scores: RuleScore[]): EngineReport {
  return { lyseVersion: "0.0.0-test", scores };
}

describe("runAll", () => {
  it("produces a deterministic, alphabetically-sorted report over given adapters", async () => {
    const report = await runAll([colorAdapter]);
    expect(report.scores).toHaveLength(1);
    expect(report.scores[0]!.ruleId).toBe("tokens/no-hardcoded-color");
    expect(typeof report.lyseVersion).toBe("string");
    const report2 = await runAll([colorAdapter]);
    expect(JSON.stringify(report2)).toBe(JSON.stringify(report)); // deterministic
  }, 60_000);
});

describe("engineGateFailures", () => {
  it("returns [] when all scores have J=1 and no metamorphic inconsistencies", () => {
    const report = makeReport([
      makeScore({ ruleId: "a/rule", youdensJ: 1, metamorphicInconsistencies: [] }),
      makeScore({ ruleId: "b/rule", youdensJ: 1, metamorphicInconsistencies: [] }),
    ]);
    expect(engineGateFailures(report)).toEqual([]);
  });

  it("returns the offending score when youdensJ < 1", () => {
    const bad = makeScore({ ruleId: "bad/rule", youdensJ: 0.5 });
    const good = makeScore({ ruleId: "good/rule", youdensJ: 1 });
    const report = makeReport([bad, good]);
    const failures = engineGateFailures(report);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.ruleId).toBe("bad/rule");
  });

  it("flags a score with non-empty metamorphicInconsistencies even when J=1", () => {
    const inconsistent = makeScore({
      ruleId: "meta/rule",
      youdensJ: 1,
      metamorphicInconsistencies: [
        { pair: "pair-1", expectViolation: true, aFlagged: true, bFlagged: false },
      ],
    });
    const report = makeReport([inconsistent]);
    const failures = engineGateFailures(report);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.ruleId).toBe("meta/rule");
  });

  it("flags both J<1 and metamorphic issues in the same report", () => {
    const report = makeReport([
      makeScore({ ruleId: "a/bad-j", youdensJ: 0.8 }),
      makeScore({ ruleId: "b/good", youdensJ: 1, metamorphicInconsistencies: [] }),
      makeScore({
        ruleId: "c/bad-meta",
        youdensJ: 1,
        metamorphicInconsistencies: [
          { pair: "p", expectViolation: false, aFlagged: false, bFlagged: true },
        ],
      }),
    ]);
    const failures = engineGateFailures(report);
    expect(failures).toHaveLength(2);
    expect(failures.map((f) => f.ruleId)).toEqual(["a/bad-j", "c/bad-meta"]);
  });
});
