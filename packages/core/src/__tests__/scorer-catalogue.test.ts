import { describe, it, expect } from "vitest";
import { scoreV3 } from "../scorer-v3.js";
import { scoreAudit } from "../scorer.js";
import type { AxisName, Finding, PerRuleOpportunity } from "../types.js";

function finding(ruleId: string, axis: AxisName): Finding {
  return {
    ruleId,
    axis,
    severity: "warning",
    location: { file: "src/x.tsx", line: 1, column: 1 },
    message: `${ruleId} fired`,
  };
}

function opp(ruleId: string, axis: AxisName, opportunities: number): PerRuleOpportunity {
  return { ruleId, axis, opportunities };
}

// Real catalogue entries, asserted in the last describe block so this file
// fails loudly if either rule is ever recategorised.
const SCORED_RULE = "tokens/no-hardcoded-spacing"; // stable, contributesToScore: true
const UNSCORED_RULE = "tokens/no-hardcoded-color"; // experimental, contributesToScore: false

describe("scoreV3 — scoreContributingRuleIds", () => {
  it("ignores findings from rules outside the contributing set", () => {
    const opportunities = [opp("a/scored", "tokens", 100)];
    const withNoise = scoreV3(
      [...Array.from({ length: 50 }, () => finding("b/unscored", "tokens"))],
      [...opportunities, opp("b/unscored", "tokens", 50)],
      { scoreContributingRuleIds: new Set(["a/scored"]) },
    );
    const clean = scoreV3([], opportunities, {
      scoreContributingRuleIds: new Set(["a/scored"]),
    });
    expect(withNoise.axes.find((a) => a.axis === "tokens")?.score).toBe(100);
    expect(withNoise.finalScore).toBe(clean.finalScore);
  });

  it("removes non-contributing rules from the denominator too", () => {
    // 40 clean opportunities on the scored rule, plus 1000 opportunities on an
    // unscored rule. If the denominator leaked, the axis would still read 100
    // but on a fabricated 1040-opportunity base.
    const r = scoreV3(
      [finding("a/scored", "tokens")],
      [opp("a/scored", "tokens", 40), opp("b/unscored", "tokens", 1000)],
      { scoreContributingRuleIds: new Set(["a/scored"]) },
    );
    const axis = r.axes.find((a) => a.axis === "tokens");
    expect(axis?.opportunities).toBe(40);
    expect(axis?.findings).toBe(1);
    expect(axis?.score).toBe(98); // round(100 * 39 / 40)
  });

  it("abstains when the contributing rules alone fall below the sample floor", () => {
    // 500 opportunities in total, but only 5 of them from a rule we trust.
    const r = scoreV3(
      [],
      [opp("a/scored", "tokens", 5), opp("b/unscored", "tokens", 495)],
      { scoreContributingRuleIds: new Set(["a/scored"]), minSampleSize: 30 },
    );
    expect(r.axes.find((a) => a.axis === "tokens")?.score).toBe("N/A");
  });

  it("scores every rule when no contributing set is supplied", () => {
    const r = scoreV3([finding("b/unscored", "tokens")], [opp("b/unscored", "tokens", 40)]);
    expect(r.axes.find((a) => a.axis === "tokens")?.score).toBe(98);
  });
});

describe("scoreAudit — honours the reliability catalogue", () => {
  const base = {
    opportunitiesByAxis: {} as Record<AxisName, number>,
    perRuleOpportunities: [
      opp(SCORED_RULE, "tokens", 100),
      opp(UNSCORED_RULE, "tokens", 100),
    ],
  };

  it("does not let an experimental rule lower the score", () => {
    const noisy = scoreAudit("v3", {
      ...base,
      findings: Array.from({ length: 80 }, () => finding(UNSCORED_RULE, "tokens")),
    }, { minScoredAxes: 1 });
    const clean = scoreAudit("v3", { ...base, findings: [] }, { minScoredAxes: 1 });
    expect(noisy.finalScore).toBe(clean.finalScore);
  });

  it("still lets a stable score-contributing rule lower the score", () => {
    const noisy = scoreAudit("v3", {
      ...base,
      findings: Array.from({ length: 80 }, () => finding(SCORED_RULE, "tokens")),
    }, { minScoredAxes: 1 });
    const clean = scoreAudit("v3", { ...base, findings: [] }, { minScoredAxes: 1 });
    expect(noisy.finalScore).not.toBe(clean.finalScore);
    expect(noisy.finalScore as number).toBeLessThan(clean.finalScore as number);
  });

  it("excludes experimental opportunities from the reported axis totals", () => {
    const r = scoreAudit("v3", { ...base, findings: [] }, { minScoredAxes: 1 });
    expect(r.axes.find((a) => a.axis === "tokens")?.opportunities).toBe(100);
  });
});

// An axis whose only findings come from rules the score ignores used to render
// as a bare, perfect 100 — on the same screen that listed those findings. The
// number was right; presenting it alone was not.
describe("scoreV3 — findings the score ignores stay visible on the axis", () => {
  it("counts them in unscoredFindings instead of dropping them", () => {
    const r = scoreV3(
      Array.from({ length: 15 }, () => finding(UNSCORED_RULE, "tokens")),
      [opp(SCORED_RULE, "tokens", 40), opp(UNSCORED_RULE, "tokens", 15)],
      { scoreContributingRuleIds: new Set([SCORED_RULE]), minScoredAxes: 1 },
    );
    const tokens = r.axes.find((a) => a.axis === "tokens");
    expect(tokens?.score).toBe(100);
    expect(tokens?.findings).toBe(0);
    expect(tokens?.unscoredFindings).toBe(15);
  });

  it("is zero when every finding on the axis counts", () => {
    const r = scoreV3(
      [finding(SCORED_RULE, "tokens")],
      [opp(SCORED_RULE, "tokens", 40)],
      { scoreContributingRuleIds: new Set([SCORED_RULE]), minScoredAxes: 1 },
    );
    expect(r.axes.find((a) => a.axis === "tokens")?.unscoredFindings).toBe(0);
  });

  it("counts findings blocked by degraded extraction, not just experimental ones", () => {
    const r = scoreV3(
      Array.from({ length: 3 }, () => finding(SCORED_RULE, "tokens")),
      [opp(SCORED_RULE, "tokens", 40), opp("tokens/dtcg-conformance", "tokens", 40)],
      {
        scoreContributingRuleIds: new Set([SCORED_RULE, "tokens/dtcg-conformance"]),
        blockedRuleIds: new Set([SCORED_RULE]),
        minScoredAxes: 1,
      },
    );
    expect(r.axes.find((a) => a.axis === "tokens")?.unscoredFindings).toBe(3);
  });
});

describe("catalogue fixtures used above", () => {
  it("SCORED_RULE is stable and contributes, UNSCORED_RULE does not", async () => {
    const { SUB_AXES } = await import("../reliability/catalogue/sub-axes.js");
    const scored = SUB_AXES.find((s) => s.ruleIds.includes(SCORED_RULE));
    const unscored = SUB_AXES.find((s) => s.ruleIds.includes(UNSCORED_RULE));
    expect(scored?.status).toBe("stable");
    expect(scored?.contributesToScore).toBe(true);
    expect(unscored?.contributesToScore).toBe(false);
  });
});
