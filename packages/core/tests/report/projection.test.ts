import { describe, it, expect } from "vitest";
import { computeProjection, groupFindings, type ProjectionRun } from "../../src/report/fix-groups.js";
import { scoreAudit } from "../../src/scorer.js";
import type { AxisName, Finding, PerRuleOpportunity } from "../../src/types.js";

function finding(
  ruleId: string,
  axis: AxisName,
  severity: Finding["severity"],
  file: string,
): Finding {
  return { ruleId, axis, severity, location: { file, line: 1, column: 1 }, message: "drift" };
}

// Projection now re-scores under the DEFAULT model (v3). minSampleSize is
// lowered to 5 so these small hand-computed fixtures activate their axes
// (production min-N is 30; real repos clear it).
const MIN = 5;
const OPTS = { minSampleSize: MIN, minScoredAxes: 1 };

/**
 * Hand-computed against the v3 scorer formula (scorer-v3.ts):
 *   per axis: opp = Σ_rule opp_rule, clean = Σ_rule max(0, opp_rule − findings_rule)
 *   axisScore = clean > 0 ? max(1, round(100 * clean / opp)) : 0   (N/A if opp < MIN)
 *   finalScore = round(mean(activated axisScores))
 *
 * The tokens axis carries TWO rules (ruleA, ruleB), so fixing both lifts the
 * shared axis all the way to 100 — the source of the super-additive
 * totalGainTop3 below.
 *
 * tokens (opp 20 = 10+10): ruleA 4 findings, ruleB 4 findings → clean 6+6=12 → 60
 * a11y   (opp 10):         ruleC 2 findings                    → clean 8    → 80
 * components (opp 10):     ruleD 1 finding                     → clean 9    → 90
 * stories/ai-surface/ai-governance: 0 opportunities → N/A (below MIN)
 *
 * baseline avg = round(mean(60, 80, 90)) = round(76.67) = 77
 */
const OPPORTUNITIES: Record<AxisName, number> = {
  tokens: 20,
  a11y: 10,
  components: 10,
  stories: 0,
  "ai-surface": 0,
  "ai-governance": 0,
};

const PER_RULE: PerRuleOpportunity[] = [
  { ruleId: "tokens/no-hardcoded-spacing", axis: "tokens", opportunities: 10 },
  { ruleId: "tokens/dtcg-conformance", axis: "tokens", opportunities: 10 },
  { ruleId: "a11y/prefers-reduced-motion", axis: "a11y", opportunities: 10 },
  { ruleId: "components/no-icon-fonts", axis: "components", opportunities: 10 },
];

const RUN: ProjectionRun = { opportunitiesByAxis: OPPORTUNITIES, perRuleOpportunities: PER_RULE };

function mainFixture(): Finding[] {
  const fs: Finding[] = [];
  for (let i = 0; i < 4; i++) fs.push(finding("tokens/no-hardcoded-spacing", "tokens", "error", `src/a${i}.tsx`));
  for (let i = 0; i < 4; i++) fs.push(finding("tokens/dtcg-conformance", "tokens", "error", `src/b${i}.tsx`));
  for (let i = 0; i < 2; i++) fs.push(finding("a11y/prefers-reduced-motion", "a11y", "error", `src/c${i}.tsx`));
  fs.push(finding("components/no-icon-fonts", "components", "info", "src/d1.tsx"));
  return fs;
}

describe("computeProjection — hand-computed fixture (v3)", () => {
  it("matches the exact v3 scorer arithmetic, including cross-rule non-linearity", () => {
    const findings = mainFixture();
    const baseline = scoreAudit("v3", { findings, ...RUN }, OPTS);
    expect(baseline.finalScore).toBe(77); // sanity check against the scorer itself

    const groups = groupFindings(findings, 40);
    const projection = computeProjection(groups, findings, RUN, "v3", OPTS, baseline.finalScore);

    expect(projection).toBeDefined();
    // Each of the two tokens rules and the a11y rule lifts finalScore by 6;
    // components/no-icon-fonts only gains 3 and is dropped by the cap.
    // Equal gains tie-break on key.localeCompare, hence dtcg before no-hardcoded.
    expect(projection?.top.map((e) => e.key)).toEqual([
      "tokens/dtcg-conformance",
      "tokens/no-hardcoded-spacing",
      "a11y/prefers-reduced-motion",
    ]);
    expect(projection?.top[0]).toMatchObject({
      key: "tokens/dtcg-conformance",
      ruleId: "tokens/dtcg-conformance",
      count: 4,
      files: 4,
      gain: 6,
      migrationScale: false,
    });
    expect(projection?.top[1]).toMatchObject({
      key: "tokens/no-hardcoded-spacing",
      ruleId: "tokens/no-hardcoded-spacing",
      count: 4,
      files: 4,
      gain: 6,
    });
    expect(projection?.top[2]).toMatchObject({
      key: "a11y/prefers-reduced-motion",
      ruleId: "a11y/prefers-reduced-motion",
      count: 2,
      files: 2,
      gain: 6,
    });

    // totalGainTop3 is ONE extra scorer run with all three top groups' findings
    // removed at once, NOT the sum of the individual gains (6 + 6 + 6 = 18):
    // fixing both tokens rules together lifts the shared axis from 60 to 100.
    expect(projection?.totalGainTop3).toBe(20);
    expect(projection?.totalGainTop3).not.toBe(6 + 6 + 6);
  });

  it("is deterministic across repeated calls", () => {
    const findings = mainFixture();
    const groups = groupFindings(findings, 40);
    const a = computeProjection(groups, findings, RUN, "v3", OPTS, 77);
    const b = computeProjection(groups, findings, RUN, "v3", OPTS, 77);
    expect(a).toEqual(b);
  });
});

describe("computeProjection — cap (v3)", () => {
  it("keeps only the top `cap` groups by gain when more groups have positive gain", () => {
    const opportunities: Record<AxisName, number> = {
      tokens: 10,
      a11y: 10,
      components: 10,
      stories: 10,
      "ai-surface": 0,
      "ai-governance": 0,
    };
    const perRule: PerRuleOpportunity[] = [
      { ruleId: "tokens/no-hardcoded-spacing", axis: "tokens", opportunities: 10 },
      { ruleId: "a11y/essentials", axis: "a11y", opportunities: 10 },
      { ruleId: "components/no-native-shadows", axis: "components", opportunities: 10 },
      { ruleId: "stories/coverage", axis: "stories", opportunities: 10 },
    ];
    // tokens 4 findings -> 60 -> fix gains 10; a11y 3 -> 70 -> gains 8;
    // components 2 -> 80 -> gains 5; stories 1 -> 90 -> gains 3 (dropped by cap).
    const findings: Finding[] = [
      ...Array.from({ length: 4 }, (_, i) => finding("tokens/no-hardcoded-spacing", "tokens", "error", `src/t${i}.tsx`)),
      ...Array.from({ length: 3 }, (_, i) => finding("a11y/essentials", "a11y", "error", `src/a${i}.tsx`)),
      ...Array.from({ length: 2 }, (_, i) => finding("components/no-native-shadows", "components", "error", `src/c${i}.tsx`)),
      finding("stories/coverage", "stories", "warning", "src/s1.tsx"),
    ];
    const run: ProjectionRun = { opportunitiesByAxis: opportunities, perRuleOpportunities: perRule };

    const baseline = scoreAudit("v3", { findings, ...run }, OPTS);
    expect(baseline.finalScore).toBe(75);

    const groups = groupFindings(findings, 40);
    const projection = computeProjection(groups, findings, run, "v3", OPTS, baseline.finalScore);

    expect(projection?.top).toHaveLength(3);
    expect(projection?.top.map((e) => ({ key: e.key, gain: e.gain }))).toEqual([
      { key: "tokens/no-hardcoded-spacing", gain: 10 },
      { key: "a11y/essentials", gain: 8 },
      { key: "components/no-native-shadows", gain: 5 },
    ]);
    // stories/ruleD has a positive gain (3) but is dropped by the cap.
    expect(projection?.top.some((e) => e.key === "stories/coverage")).toBe(false);
  });
});

describe("computeProjection — edge cases (v3)", () => {
  it("returns undefined when finalScore is N/A", () => {
    const findings = mainFixture();
    const groups = groupFindings(findings, 40);
    expect(computeProjection(groups, findings, RUN, "v3", OPTS, "N/A")).toBeUndefined();
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
    const perRule: PerRuleOpportunity[] = [
      { ruleId: "tokens/description-coverage", axis: "tokens", opportunities: 1000 },
    ];
    // clean 999 / opp 1000 -> round(99.9) = 100 both before and after removal
    // (clean 1000 -> 100) -> gain 0. opp 1000 >= default MIN_SAMPLE_SIZE (30).
    const findings: Finding[] = [finding("tokens/description-coverage", "tokens", "info", "src/only.tsx")];
    const run: ProjectionRun = { opportunitiesByAxis: opportunities, perRuleOpportunities: perRule };
    const oneAxis = { minScoredAxes: 1 };
    const baseline = scoreAudit("v3", { findings, ...run }, oneAxis);
    expect(baseline.finalScore).toBe(100);

    const groups = groupFindings(findings, 40);
    expect(
      computeProjection(groups, findings, run, "v3", oneAxis, baseline.finalScore),
    ).toBeUndefined();
  });
});
