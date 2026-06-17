import { describe, it, expect } from "vitest";
import { SUB_AXES } from "../../src/reliability/catalogue/sub-axes.js";
import { resolveStableSubAxes } from "../../src/reliability/score/stable-sub-axes.js";
import { resolveScoreV2PreviewSubAxes } from "../../src/reliability/score/score-v2-preview.js";
import { computeScoreV1 } from "../../src/reliability/score/formula-v1.js";
import { formatExplainScore } from "../../src/commands/explain-score.js";
import type { Finding } from "../../src/reliability/types.js";

// #71 — score-v2 PREVIEW channel. A read-only, strict superset of the trusted
// v1 set: every v1 contributor PLUS the deterministic structural sub-axes whose
// synthetic recall AND precision Wilson lower bounds both cleared the 0.90 gate.
// It must NEVER alter the trusted (v1) score.

// The 10 deterministic gate-clearers promoted into the preview (recall LB and
// precision LB both >= 0.90 on the synthetic recall suite, 2026-06-17 run).
const PROMOTED = [
  "tokens.description-coverage",
  "components.native-shadows",
  "components.naming-component-pascalcase",
  "components.naming-hook-prefix",
  "stories.coverage",
  "ai-surface.agents-md-quality",
  "ai-governance.ai-marker-component-present",
  "ai-governance.ai-loading-error-states",
  "ai-governance.ai-content-live-region",
  "ai-governance.feedback-control-present",
];

describe("score-v2 preview sub-axis set (#71)", () => {
  it("is a strict superset of the trusted v1 stable set", () => {
    const v1 = resolveStableSubAxes(SUB_AXES, { filterRan: false });
    const v2 = resolveScoreV2PreviewSubAxes(SUB_AXES, { filterRan: false });
    for (const id of v1) expect(v2.has(id)).toBe(true);
    expect(v2.size).toBeGreaterThan(v1.size);
  });

  it("includes every promoted deterministic gate-clearer", () => {
    const v2 = resolveScoreV2PreviewSubAxes(SUB_AXES, { filterRan: false });
    for (const id of PROMOTED) expect(v2.has(id)).toBe(true);
  });

  it("excludes a11y.essentials (precision LB 0.898 < 0.90 — missed the gate)", () => {
    const v2 = resolveScoreV2PreviewSubAxes(SUB_AXES, { filterRan: false });
    expect(v2.has("a11y.essentials")).toBe(false);
  });

  it("preview counts a finding in a preview-only sub-axis that v1 ignores", () => {
    const finding: Finding = {
      ruleId: "stories/coverage",
      subAxisId: "stories.coverage",
      severity: "warning",
      confidence: "high",
      message: "missing story",
      file: "Button.tsx",
      line: 1,
      column: null,
    };
    const confidenceByAxis: Record<string, number> = { "stories.coverage": 0.9 };
    const v1 = computeScoreV1({
      findings: [finding],
      stableSubAxes: resolveStableSubAxes(SUB_AXES, { filterRan: false }),
      confidenceByAxis,
    });
    const v2 = computeScoreV1({
      findings: [finding],
      stableSubAxes: resolveScoreV2PreviewSubAxes(SUB_AXES, { filterRan: false }),
      confidenceByAxis,
    });
    expect(v1.findingsCountedInScore).toBe(0);
    expect(v2.findingsCountedInScore).toBe(1);
  });
});

describe("formatExplainScore surfaces the read-only preview (#71)", () => {
  const finding: Finding = {
    ruleId: "stories/coverage",
    subAxisId: "stories.coverage",
    severity: "warning",
    confidence: "high",
    message: "missing story",
    file: "Button.tsx",
    line: 1,
    column: null,
  };
  const confidenceByAxis: Record<string, number> = { "stories.coverage": 0.9 };

  it("reports a scoreV2Preview that counts preview-only sub-axes the trusted score ignores", () => {
    const stableSubAxes = resolveStableSubAxes(SUB_AXES, { filterRan: false });
    const previewSubAxes = resolveScoreV2PreviewSubAxes(SUB_AXES, { filterRan: false });
    const r = formatExplainScore({ findings: [finding], stableSubAxes, previewSubAxes, confidenceByAxis });
    expect(r.scoreV2Preview).toBeDefined();
    // trusted score ignores stories.coverage → no penalty; preview counts it → lower.
    expect(r.countedTotal).toBe(0);
    expect(r.scoreV2Preview?.countedTotal).toBe(1);
    expect(r.scoreV2Preview?.score).toBeLessThan(r.score);
    expect(r.rawText).toContain("score-v2 preview");
  });

  it("omits the preview entirely when no previewSubAxes set is provided", () => {
    const stableSubAxes = resolveStableSubAxes(SUB_AXES, { filterRan: false });
    const r = formatExplainScore({ findings: [finding], stableSubAxes, confidenceByAxis });
    expect(r.scoreV2Preview).toBeUndefined();
    expect(r.rawText).not.toContain("score-v2 preview");
  });
});
