import { describe, it, expect } from "vitest";
import { blockedExtractorsByAxis } from "../coverage.js";
import type { ExtractionReport, ExtractionReportEntry } from "../../../graph/types.js";

type Extractor = ExtractionReportEntry["extractor"];

const report = (statuses: Partial<Record<Extractor, "ok" | "degraded">>): ExtractionReport => ({
  entries: (Object.entries(statuses) as [Extractor, "ok" | "degraded"][]).map(
    ([extractor, status]) => ({ extractor, status, evidence: {}, remediation: null }),
  ),
  conflicts: [],
});

describe("blockedExtractorsByAxis", () => {
  it("names an extractor only on the axes whose rules it blocked", () => {
    // The defect this closes: a flat list appended "the stories extractor did
    // not complete" to the tokens and a11y abstention reasons, where it is
    // globally true and causally irrelevant — pointing the user at the wrong
    // thing, which is worse than saying nothing.
    const byAxis = blockedExtractorsByAxis(report({ stories: "degraded", tokens: "ok", components: "ok" }));
    expect(byAxis.get("stories")).toEqual(["stories"]);
    expect(byAxis.get("tokens")).toBeUndefined();
    expect(byAxis.get("a11y")).toBeUndefined();
  });

  it("reaches across axes when the map does — components blocks token rules", () => {
    const byAxis = blockedExtractorsByAxis(report({ components: "degraded" }));
    expect(byAxis.get("tokens")).toContain("components");
    expect(byAxis.get("components")).toContain("components");
  });

  it("is empty when every extractor finished", () => {
    expect(blockedExtractorsByAxis(report({ tokens: "ok", components: "ok" })).size).toBe(0);
  });

  it("does not list the same extractor twice for one axis", () => {
    const byAxis = blockedExtractorsByAxis(report({ components: "degraded" }));
    for (const list of byAxis.values()) expect(new Set(list).size).toBe(list.length);
  });
});
