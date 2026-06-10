import { describe, expect, it } from "vitest";
import {
  DIVERGENCE_THRESHOLD,
  detectDivergence,
  type DivergenceDiagnostic,
} from "../divergence.js";
import { KAPPA_FIXTURES } from "../kappa-fixtures.js";
import { aggregateKappaByDimension } from "../kappa.js";

describe("DIVERGENCE_THRESHOLD", () => {
  it("is 0.4 (Landis & Koch 'poor agreement' boundary)", () => {
    expect(DIVERGENCE_THRESHOLD).toBe(0.4);
  });
});

describe("detectDivergence", () => {
  it("flags dimensions below threshold and leaves high-kappa ones unflagged", () => {
    const kappaResults = aggregateKappaByDimension(KAPPA_FIXTURES);
    const diagnostics = detectDivergence(kappaResults);

    const flaggedIds = diagnostics.map((d) => d.dimensionId);

    // low-agreement kappa=0.0 → below 0.4 → flagged
    expect(flaggedIds).toContain("low-agreement");

    // high-agreement kappa=0.8 → above 0.4 → NOT flagged
    expect(flaggedIds).not.toContain("high-agreement");
  });

  it("medium-agreement kappa=0.5 is above threshold — not flagged", () => {
    const kappaResults = aggregateKappaByDimension(KAPPA_FIXTURES);
    const diagnostics = detectDivergence(kappaResults);
    const flaggedIds = diagnostics.map((d) => d.dimensionId);
    expect(flaggedIds).not.toContain("medium-agreement");
  });

  it("diagnostic contains dimensionId, kappa, disagreementRate, and type", () => {
    const kappaResults = aggregateKappaByDimension(KAPPA_FIXTURES);
    const diagnostics = detectDivergence(kappaResults);
    expect(diagnostics.length).toBeGreaterThan(0);

    for (const d of diagnostics) {
      expect(typeof d.dimensionId).toBe("string");
      expect(typeof d.kappa).toBe("number");
      expect(typeof d.disagreementRate).toBe("number");
      expect(d.type).toBe("rule-divergence");
    }
  });

  it("disagreementRate = 1 - agreement for each flagged dimension", () => {
    const kappaResults = aggregateKappaByDimension(KAPPA_FIXTURES);
    const diagnostics = detectDivergence(kappaResults);

    for (const d of diagnostics) {
      const source = kappaResults.find((r) => r.dimensionId === d.dimensionId)!;
      expect(d.disagreementRate).toBeCloseTo(1 - source.agreement, 10);
    }
  });

  it("is deterministic: same inputs → same output", () => {
    const kappaResults = aggregateKappaByDimension(KAPPA_FIXTURES);
    const d1 = detectDivergence(kappaResults);
    const d2 = detectDivergence(kappaResults);
    expect(JSON.stringify(d1)).toBe(JSON.stringify(d2));
  });

  it("returns empty array when all dimensions are above threshold", () => {
    const allHigh = [{ dimensionId: "x", kappa: 0.9, n: 10, agreement: 0.95, precision: 0.9, recall: 0.9, precisionWilsonLb: 0.7, recallWilsonLb: 0.7 }];
    expect(detectDivergence(allHigh)).toEqual([]);
  });

  it("exact boundary: kappa = 0.4 is NOT flagged (threshold is strictly less-than)", () => {
    const atBoundary = [{ dimensionId: "boundary", kappa: 0.4, n: 10, agreement: 0.8, precision: 0.8, recall: 0.8, precisionWilsonLb: 0.6, recallWilsonLb: 0.6 }];
    expect(detectDivergence(atBoundary)).toEqual([]);
  });

  it("kappa just below threshold (0.399) is flagged", () => {
    const justBelow = [{ dimensionId: "near-boundary", kappa: 0.399, n: 10, agreement: 0.75, precision: 0.75, recall: 0.75, precisionWilsonLb: 0.5, recallWilsonLb: 0.5 }];
    const diagnostics = detectDivergence(justBelow);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.dimensionId).toBe("near-boundary");
  });
});

describe("DivergenceDiagnostic shape", () => {
  it("is distinct from DS-facing Finding (no ruleId, severity, message, or file fields)", () => {
    const kappaResults = aggregateKappaByDimension(KAPPA_FIXTURES);
    const diagnostics = detectDivergence(kappaResults);

    for (const d of diagnostics) {
      expect(d).not.toHaveProperty("severity");
      expect(d).not.toHaveProperty("message");
      expect(d).not.toHaveProperty("file");
      expect(d).not.toHaveProperty("line");
    }
  });
});
