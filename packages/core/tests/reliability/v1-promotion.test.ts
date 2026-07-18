import { describe, it, expect } from "vitest";
import { SUB_AXES } from "../../src/reliability/catalogue/sub-axes.js";
import { resolveStableSubAxes } from "../../src/reliability/score/stable-sub-axes.js";

// The 10 deterministic gate-clearers promoted into the trusted v1 score
// (recall LB and precision LB both >= 0.90 on the 2026-06-17 synthetic run).
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

describe("v1 promotion of the 10 deterministic gate-clearers (#71)", () => {
  it("each promoted sub-axis is now in the trusted v1 stable set", () => {
    const v1 = resolveStableSubAxes(SUB_AXES, { filterRan: false });
    for (const id of PROMOTED) expect(v1.has(id)).toBe(true);
  });

  it("each promoted sub-axis is status:stable + contributesToScore + a deterministic validator with both LBs >= 0.90", () => {
    for (const id of PROMOTED) {
      const sa = SUB_AXES.find((s) => s.id === id);
      expect(sa, `missing sub-axis ${id}`).toBeDefined();
      expect(sa!.status).toBe("stable");
      expect(sa!.contributesToScore).toBe(true);
      expect(sa!.deterministicValidator).toBe(true);
      expect(sa!.recallWilsonLowerBound).toBeGreaterThanOrEqual(0.9);
      expect(sa!.precisionWilsonLowerBound).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("the trusted stable set includes all 10 promoted (≥ 22 — later cohorts add more)", () => {
    const v1 = resolveStableSubAxes(SUB_AXES, { filterRan: false });
    for (const id of PROMOTED) expect(v1.has(id)).toBe(true);
    expect(v1.size).toBeGreaterThanOrEqual(22);
  });
});

// The 4 deterministic coverage rules promoted on the 2026-06-20 batch run
// (recall LB and precision LB both >= 0.90 on the synthetic recall suite).
const PROMOTED_2026_06_20 = [
  "tokens.media-query",
  "a11y.forced-colors",
  "ai-governance.product-analytics",
  "tokens.css-custom-property-export",
  "tokens.container-query",
  "a11y.html-lang",
  "a11y.semantic-html",
  "components.icon-decorative-aria",
];

// Demoted back to experimental after corpus precision-validation (2026-06-20):
// `tokens.gradient` fires on functional gradients (alpha-checkerboards).
// Precise but not trustworthy as a scored signal.
const DEMOTED_2026_06_20 = ["tokens.gradient"];

// Re-promoted 2026-06-20 after the #77 public-API re-scope: doc-comments now
// flags only components re-exported from their own package entry (per-package
// scoping), eliminating the cross-package-collision FPs and the ~3585-finding
// flood (mantine: 3585 → 14 true positives, 0 FP across 5 OSS DS). Synthetic
// recall LB 0.901 / precision LB 0.929.
const REPROMOTED_2026_06_20 = ["components.doc-comments"];

describe("v1 promotion of the 2026-06-20 deterministic coverage batch", () => {
  it("each batch sub-axis is status:stable + contributesToScore + deterministic with both LBs >= 0.90", () => {
    for (const id of PROMOTED_2026_06_20) {
      const sa = SUB_AXES.find((s) => s.id === id);
      expect(sa, `missing sub-axis ${id}`).toBeDefined();
      expect(sa!.status).toBe("stable");
      expect(sa!.contributesToScore).toBe(true);
      expect(sa!.deterministicValidator).toBe(true);
      expect(sa!.recallWilsonLowerBound).toBeGreaterThanOrEqual(0.9);
      expect(sa!.precisionWilsonLowerBound).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("the trusted stable set now includes the batch (≥ 52 total)", () => {
    const v1 = resolveStableSubAxes(SUB_AXES, { filterRan: false });
    for (const id of PROMOTED_2026_06_20) expect(v1.has(id)).toBe(true);
    expect(v1.size).toBeGreaterThanOrEqual(52);
  });

  it("the re-promoted #77 public-API doc-comments sub-axis is stable + scored with both LBs >= 0.90", () => {
    const v1 = resolveStableSubAxes(SUB_AXES, { filterRan: false });
    for (const id of REPROMOTED_2026_06_20) {
      const sa = SUB_AXES.find((s) => s.id === id);
      expect(sa, `missing sub-axis ${id}`).toBeDefined();
      expect(sa!.status).toBe("stable");
      expect(sa!.contributesToScore).toBe(true);
      expect(sa!.deterministicValidator).toBe(true);
      expect(sa!.recallWilsonLowerBound).toBeGreaterThanOrEqual(0.9);
      expect(sa!.precisionWilsonLowerBound).toBeGreaterThanOrEqual(0.9);
      expect(v1.has(id)).toBe(true);
    }
  });

  it("the corpus-demoted rules are NOT in the trusted v1 stable set", () => {
    const v1 = resolveStableSubAxes(SUB_AXES, { filterRan: false });
    for (const id of DEMOTED_2026_06_20) {
      const sa = SUB_AXES.find((s) => s.id === id);
      expect(sa, `missing sub-axis ${id}`).toBeDefined();
      expect(sa!.status).toBe("experimental");
      expect(sa!.contributesToScore).toBe(false);
      expect(v1.has(id)).toBe(false);
    }
  });
});
