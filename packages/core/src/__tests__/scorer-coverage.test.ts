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

describe("scoreV3 — rules blocked by degraded extraction", () => {
  const opportunities = [
    opp("needs-inventory", "components", 100),
    opp("reads-source", "components", 100),
  ];

  it("drops a blocked rule from both sides of the ratio", () => {
    const r = scoreV3([finding("needs-inventory", "components")], opportunities, {
      blockedRuleIds: new Set(["needs-inventory"]),
      minScoredAxes: 1,
    });
    const axis = r.axes.find((a) => a.axis === "components");
    expect(axis?.opportunities).toBe(100);
    expect(axis?.findings).toBe(0);
    expect(axis?.score).toBe(100);
  });

  it("leaves rules that read source directly scoring on the same axis", () => {
    const r = scoreV3([finding("reads-source", "components")], opportunities, {
      blockedRuleIds: new Set(["needs-inventory"]),
      minScoredAxes: 1,
    });
    expect(r.axes.find((a) => a.axis === "components")?.score).toBe(99);
  });

  it("abstains only when the exclusion leaves the axis below the sample floor", () => {
    const r = scoreV3([], [opp("needs-inventory", "components", 100), opp("reads-source", "components", 5)], {
      blockedRuleIds: new Set(["needs-inventory"]),
      minSampleSize: 30,
      minScoredAxes: 1,
    });
    expect(r.axes.find((a) => a.axis === "components")?.score).toBe("N/A");
  });

  it("composes with the reliability catalogue filter", () => {
    const r = scoreV3([], opportunities, {
      scoreContributingRuleIds: new Set(["needs-inventory", "reads-source"]),
      blockedRuleIds: new Set(["needs-inventory"]),
      minScoredAxes: 1,
    });
    expect(r.axes.find((a) => a.axis === "components")?.opportunities).toBe(100);
  });
});
