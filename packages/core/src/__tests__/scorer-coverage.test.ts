import { describe, it, expect } from "vitest";
import { scoreV3 } from "../scorer-v3.js";
import type { AxisName, Finding, PerRuleOpportunity } from "../types.js";

function opp(ruleId: string, axis: AxisName, opportunities: number): PerRuleOpportunity {
  return { ruleId, axis, opportunities };
}

function finding(ruleId: string, axis: AxisName): Finding {
  return {
    ruleId,
    axis,
    severity: "warning",
    location: { file: "src/x.tsx", line: 1, column: 1 },
    message: "drift",
  };
}

describe("scoreV3 — coverage precondition", () => {
  const opportunities = [opp("tokens/r", "tokens", 100), opp("a11y/r", "a11y", 100)];

  it("abstains on an axis whose extractor degraded, however clean it looks", () => {
    const r = scoreV3([], opportunities, { degradedAxes: new Set<AxisName>(["tokens"]), minScoredAxes: 1 });
    const tokens = r.axes.find((a) => a.axis === "tokens");
    expect(tokens?.score).toBe("N/A");
    expect(tokens?.opportunities).toBe(100);
  });

  it("keeps the degraded axis out of the final mean", () => {
    const withTokens = scoreV3([finding("a11y/r", "a11y")], opportunities, { minScoredAxes: 1 });
    const withoutTokens = scoreV3([finding("a11y/r", "a11y")], opportunities, {
      degradedAxes: new Set<AxisName>(["tokens"]),
      minScoredAxes: 1,
    });
    expect(withTokens.finalScore).toBe(100); // (100 + 99) / 2 rounded
    expect(withoutTokens.finalScore).toBe(99); // a11y alone
  });

  it("returns N/A overall when every activated axis is degraded", () => {
    const r = scoreV3([], opportunities, {
      degradedAxes: new Set<AxisName>(["tokens", "a11y"]),
    });
    expect(r.finalScore).toBe("N/A");
    expect(r.tier).toBe("N/A");
  });

  it("does not affect axes whose extractor is healthy", () => {
    const r = scoreV3([], opportunities, { degradedAxes: new Set<AxisName>(["tokens"]), minScoredAxes: 1 });
    expect(r.axes.find((a) => a.axis === "a11y")?.score).toBe(100);
  });
});
