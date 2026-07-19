import { describe, it, expect } from "vitest";
import { SUB_AXES } from "../../src/reliability/catalogue/sub-axes.js";
import { resolveStableSubAxes } from "../../src/reliability/score/stable-sub-axes.js";
import { resolveScoreV2PreviewSubAxes } from "../../src/reliability/score/score-v2-preview.js";
import type { SubAxisRecord } from "../../src/reliability/types.js";

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

// The `formatExplainScore` integration (rendering a "score-v2 preview" line)
// was retired by H4 (explain --score now surfaces only the audit's
// `finalScore` — see commands/__tests__/explain-score.test.ts). This module
// and the `resolveScoreV2PreviewSubAxes` unit tests above stay on disk per
// the H4 task scope (retired in a later cleanup, not deleted here).
