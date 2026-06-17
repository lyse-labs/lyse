import { describe, it, expect } from "vitest";
import { SUB_AXES } from "../../src/reliability/catalogue/sub-axes.js";
import { resolveStableSubAxes } from "../../src/reliability/score/stable-sub-axes.js";
import { resolveScoreV2PreviewSubAxes } from "../../src/reliability/score/score-v2-preview.js";
import { formatExplainScore } from "../../src/commands/explain-score.js";
import type { Finding, SubAxisRecord } from "../../src/reliability/types.js";

// #71 — score-v2 PREVIEW channel. A read-only, strict superset of the trusted
// v1 set: every v1 contributor PLUS any sub-axis flagged `contributesToScoreV2`
// (gate-cleared but not yet promoted into v1). The mechanism is tested against
// synthetic records so it does not depend on which rules are currently promoted.

function rec(over: Partial<SubAxisRecord> & Pick<SubAxisRecord, "id">): SubAxisRecord {
  return {
    axis: "tokens",
    name: over.id,
    status: "experimental",
    precisionMeasured: null,
    recallMeasured: null,
    precisionWilsonLowerBound: null,
    recallWilsonLowerBound: null,
    lastCalibrated: null,
    contributesToScore: false,
    ruleIds: [over.id],
    llmDriven: false,
    ...over,
  };
}

describe("resolveScoreV2PreviewSubAxes (#71)", () => {
  it("includes every v1 contributor (superset of the trusted set)", () => {
    const axes = [
      rec({ id: "a.stable", status: "stable", contributesToScore: true }),
      rec({ id: "b.pending", contributesToScoreV2: true }),
      rec({ id: "c.experimental" }),
    ];
    const v1 = resolveStableSubAxes(axes, { filterRan: false });
    const v2 = resolveScoreV2PreviewSubAxes(axes, { filterRan: false });
    for (const id of v1) expect(v2.has(id)).toBe(true);
  });

  it("adds a gate-cleared-but-unpromoted sub-axis (contributesToScoreV2) that v1 ignores", () => {
    const axes = [
      rec({ id: "a.stable", status: "stable", contributesToScore: true }),
      rec({ id: "b.pending", contributesToScoreV2: true }),
    ];
    const v1 = resolveStableSubAxes(axes, { filterRan: false });
    const v2 = resolveScoreV2PreviewSubAxes(axes, { filterRan: false });
    expect(v1.has("b.pending")).toBe(false);
    expect(v2.has("b.pending")).toBe(true);
  });

  it("never drops below v1 on the real catalogue (superset, possibly equal)", () => {
    const v1 = resolveStableSubAxes(SUB_AXES, { filterRan: false });
    const v2 = resolveScoreV2PreviewSubAxes(SUB_AXES, { filterRan: false });
    for (const id of v1) expect(v2.has(id)).toBe(true);
    expect(v2.size).toBeGreaterThanOrEqual(v1.size);
  });
});

describe("formatExplainScore surfaces the read-only preview (#71)", () => {
  const finding: Finding = {
    ruleId: "tokens/no-hardcoded-color",
    subAxisId: "tokens.color",
    severity: "warning",
    confidence: "high",
    message: "hardcoded color",
    file: "Button.tsx",
    line: 1,
    column: null,
  };
  const confidenceByAxis: Record<string, number> = { "tokens.color": 0.9 };

  it("reports a scoreV2Preview that counts preview-only sub-axes the trusted score ignores", () => {
    const stableSubAxes = resolveStableSubAxes(SUB_AXES, { filterRan: false });
    // tokens.color is NOT promoted (drift, data/LLM-walled) — inject it into the
    // preview set explicitly to exercise the rendering mechanism.
    const previewSubAxes = new Set([...stableSubAxes, "tokens.color"]);
    const r = formatExplainScore({ findings: [finding], stableSubAxes, previewSubAxes, confidenceByAxis });
    expect(r.scoreV2Preview).toBeDefined();
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
