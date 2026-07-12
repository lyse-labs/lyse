import { describe, it, expect } from "vitest";
import { computeProjection, groupFindings } from "../../src/report/fix-groups.js";
import { scoreFromFindings } from "../../src/scorer.js";
import type { AxisName, Finding } from "../../src/types.js";

function finding(
  ruleId: string,
  axis: AxisName,
  severity: Finding["severity"],
  file: string,
): Finding {
  return { ruleId, axis, severity, location: { file, line: 1, column: 1 }, message: "drift" };
}

/**
 * Hand-computed against the real scorer formula (scorer.ts):
 *   rateScore = 100 * (1 - sevPenalty/opportunities), sevPenalty = 4*errors + 2*warnings + 1*info
 *   axisScore = round(max(0, min(rateScore, 100)))     (K=0, so the absolute cap is a no-op)
 *   finalScore = round(mean(active axisScores)), then auto-fail caps to 39 when >=2 axes score 0.
 *
 * tokens (opp 10): 3 errors -> sevPenalty 12 -> rate -20 -> axisScore 0
 * a11y   (opp 10): 3 errors -> sevPenalty 12 -> rate -20 -> axisScore 0
 * components (opp 20): 1 info -> sevPenalty 1 -> rate 95 -> axisScore 95
 * stories    (opp 20): 1 info -> sevPenalty 1 -> rate 95 -> axisScore 95
 *
 * baseline avg = (0+0+95+95)/4 = 47.5 -> round 48; 2 axes at 0 -> auto-fail caps to 39.
 */
const OPPORTUNITIES: Record<AxisName, number> = {
  tokens: 10,
  a11y: 10,
  components: 20,
  stories: 20,
  "ai-surface": 0,
  "ai-governance": 0,
};

function mainFixture(): Finding[] {
  return [
    finding("tokens/ruleA", "tokens", "error", "src/a1.tsx"),
    finding("tokens/ruleA", "tokens", "error", "src/a2.tsx"),
    finding("tokens/ruleA", "tokens", "error", "src/a3.tsx"),
    finding("a11y/ruleB", "a11y", "error", "src/b1.tsx"),
    finding("a11y/ruleB", "a11y", "error", "src/b2.tsx"),
    finding("a11y/ruleB", "a11y", "error", "src/b3.tsx"),
    finding("components/ruleC", "components", "info", "src/c1.tsx"),
    finding("stories/ruleD", "stories", "info", "src/d1.tsx"),
  ];
}

describe("computeProjection — hand-computed fixture", () => {
  it("matches the exact scorer arithmetic, including auto-fail non-linearity", () => {
    const findings = mainFixture();
    const baseline = scoreFromFindings(findings, OPPORTUNITIES, {});
    expect(baseline.finalScore).toBe(39); // sanity check against the scorer itself

    const groups = groupFindings(findings, 40);
    const projection = computeProjection(groups, findings, OPPORTUNITIES, {}, baseline.finalScore);

    expect(projection).toBeDefined();
    // components/ruleC and stories/ruleD each raise their own axis from 95->100,
    // but the auto-fail cap (still 2 zero axes) keeps finalScore pinned at 39 -> gain 0 -> dropped.
    expect(projection?.top.map((e) => e.key)).toEqual(["a11y/ruleB", "tokens/ruleA"]);
    expect(projection?.top[0]).toMatchObject({
      key: "a11y/ruleB",
      ruleId: "a11y/ruleB",
      count: 3,
      files: 3,
      gain: 34,
      migrationScale: false,
    });
    expect(projection?.top[1]).toMatchObject({
      key: "tokens/ruleA",
      ruleId: "tokens/ruleA",
      count: 3,
      files: 3,
      gain: 34,
    });

    // totalGainTop3 is ONE extra scorer run with both top groups' findings
    // removed at once, NOT the sum of the individual gains (34 + 34 = 68):
    // removing both zero-axes lifts the auto-fail cap entirely.
    expect(projection?.totalGainTop3).toBe(59);
    expect(projection?.totalGainTop3).not.toBe(34 + 34);
  });

  it("is deterministic across repeated calls", () => {
    const findings = mainFixture();
    const groups = groupFindings(findings, 40);
    const a = computeProjection(groups, findings, OPPORTUNITIES, {}, 39);
    const b = computeProjection(groups, findings, OPPORTUNITIES, {}, 39);
    expect(a).toEqual(b);
  });
});

describe("computeProjection — cap", () => {
  it("keeps only the top `cap` groups by gain when more groups have positive gain", () => {
    const opportunities: Record<AxisName, number> = {
      tokens: 10,
      a11y: 10,
      components: 10,
      stories: 10,
      "ai-surface": 0,
      "ai-governance": 0,
    };
    const findings: Finding[] = [
      finding("tokens/ruleA", "tokens", "error", "src/t1.tsx"), // sevPenalty 4 -> axisScore 60 -> gain 10
      finding("a11y/ruleB", "a11y", "error", "src/a1.tsx"), // sevPenalty 8 (2 errors) -> axisScore 20 -> gain 20
      finding("a11y/ruleB", "a11y", "error", "src/a2.tsx"),
      finding("components/ruleC", "components", "error", "src/c1.tsx"), // sevPenalty 12 (3 errors) -> axisScore 0 -> gain 25
      finding("components/ruleC", "components", "error", "src/c2.tsx"),
      finding("components/ruleC", "components", "error", "src/c3.tsx"),
      finding("stories/ruleD", "stories", "warning", "src/s1.tsx"), // sevPenalty 2 -> axisScore 80 -> gain 5
    ];

    const baseline = scoreFromFindings(findings, opportunities, {});
    expect(baseline.finalScore).toBe(40);

    const groups = groupFindings(findings, 40);
    const projection = computeProjection(groups, findings, opportunities, {}, baseline.finalScore);

    expect(projection?.top).toHaveLength(3);
    expect(projection?.top.map((e) => ({ key: e.key, gain: e.gain }))).toEqual([
      { key: "components/ruleC", gain: 25 },
      { key: "a11y/ruleB", gain: 20 },
      { key: "tokens/ruleA", gain: 10 },
    ]);
    // stories/ruleD has a positive gain (5) but is dropped by the cap.
    expect(projection?.top.some((e) => e.key === "stories/ruleD")).toBe(false);
  });
});

describe("computeProjection — edge cases", () => {
  it("returns undefined when finalScore is N/A", () => {
    const findings = mainFixture();
    const groups = groupFindings(findings, 40);
    expect(computeProjection(groups, findings, OPPORTUNITIES, {}, "N/A")).toBeUndefined();
  });

  it("returns undefined when no group has positive gain", () => {
    const opportunities: Record<AxisName, number> = {
      tokens: 1000,
      a11y: 0,
      components: 0,
      stories: 0,
      "ai-surface": 0,
      "ai-governance": 0,
    };
    // sevPenalty 1 / opp 1000 -> rate 99.9 -> axisScore round(99.9) = 100 both
    // before and after removal (sevPenalty 0 -> rate 100) -> gain 0.
    const findings: Finding[] = [finding("tokens/rule", "tokens", "info", "src/only.tsx")];
    const baseline = scoreFromFindings(findings, opportunities, {});
    expect(baseline.finalScore).toBe(100);

    const groups = groupFindings(findings, 40);
    expect(computeProjection(groups, findings, opportunities, {}, baseline.finalScore)).toBeUndefined();
  });
});
