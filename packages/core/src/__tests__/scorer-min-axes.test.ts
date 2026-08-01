import { describe, it, expect } from "vitest";
import { scoreV3, MIN_SCORED_AXES } from "../scorer-v3.js";
import type { AxisName, PerRuleOpportunity } from "../types.js";

function opp(ruleId: string, axis: AxisName, opportunities = 100): PerRuleOpportunity {
  return { ruleId, axis, opportunities };
}

describe("scoreV3 — minimum scored axes", () => {
  it("publishes no headline score when fewer than MIN_SCORED_AXES axes could be scored", () => {
    const r = scoreV3([], [opp("tokens/r", "tokens"), opp("a11y/r", "a11y")]);
    expect(r.axes.filter((a) => a.score !== "N/A")).toHaveLength(2);
    expect(MIN_SCORED_AXES).toBe(3);
    expect(r.finalScore).toBe("N/A");
    expect(r.tier).toBe("N/A");
  });

  it("publishes a score once the floor is reached", () => {
    const r = scoreV3(
      [],
      [opp("tokens/r", "tokens"), opp("a11y/r", "a11y"), opp("stories/r", "stories")],
    );
    expect(r.finalScore).toBe(100);
  });

  it("keeps the per-axis scores visible even when the headline abstains", () => {
    const r = scoreV3([], [opp("tokens/r", "tokens")]);
    expect(r.finalScore).toBe("N/A");
    expect(r.axes.find((a) => a.axis === "tokens")?.score).toBe(100);
  });

  it("counts only axes that actually scored, not axes that merely have opportunities", () => {
    // stories has opportunities but its extractor degraded, so it does not count
    // toward the floor and the headline abstains on 2 scored axes.
    const r = scoreV3(
      [],
      [opp("tokens/r", "tokens"), opp("a11y/r", "a11y"), opp("stories/r", "stories")],
      { degradedAxes: new Set<AxisName>(["stories"]) },
    );
    expect(r.axes.filter((a) => a.score !== "N/A")).toHaveLength(2);
    expect(r.finalScore).toBe("N/A");
  });

  it("honours an explicit override", () => {
    const r = scoreV3([], [opp("tokens/r", "tokens")], { minScoredAxes: 1 });
    expect(r.finalScore).toBe(100);
  });
});
