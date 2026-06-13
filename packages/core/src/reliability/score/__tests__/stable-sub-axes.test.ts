import { describe, it, expect } from "vitest";
import { resolveStableSubAxes } from "../stable-sub-axes.js";
import type { SubAxisRecord } from "../../types.js";
import { SUB_AXES } from "../../catalogue/sub-axes.js";

function makeSubAxis(partial: Partial<SubAxisRecord> & { id: string }): SubAxisRecord {
  return {
    axis: "tokens",
    name: partial.id,
    status: "experimental",
    precisionMeasured: null,
    recallMeasured: null,
    precisionWilsonLowerBound: null,
    recallWilsonLowerBound: null,
    lastCalibrated: null,
    contributesToScore: false,
    ruleIds: [],
    llmDriven: false,
    ...partial,
  };
}

describe("resolveStableSubAxes", () => {
  it("includes base stable contributor regardless of filterRan", () => {
    const axes = [makeSubAxis({ id: "a.stable", status: "stable", contributesToScore: true })];
    expect(resolveStableSubAxes(axes, { filterRan: false }).has("a.stable")).toBe(true);
    expect(resolveStableSubAxes(axes, { filterRan: true }).has("a.stable")).toBe(true);
  });

  it("includes filter-gated sub-axis ONLY when filterRan is true", () => {
    const axes = [
      makeSubAxis({ id: "a.gated", status: "experimental", contributesToScore: false, contributesToScoreWhenFiltered: true }),
    ];
    expect(resolveStableSubAxes(axes, { filterRan: false }).has("a.gated")).toBe(false);
    expect(resolveStableSubAxes(axes, { filterRan: true }).has("a.gated")).toBe(true);
  });

  it("never includes a record with neither flag", () => {
    const axes = [makeSubAxis({ id: "a.none", status: "experimental", contributesToScore: false })];
    expect(resolveStableSubAxes(axes, { filterRan: false }).has("a.none")).toBe(false);
    expect(resolveStableSubAxes(axes, { filterRan: true }).has("a.none")).toBe(false);
  });

  it("includes a record with both flags in both modes", () => {
    const axes = [
      makeSubAxis({ id: "a.both", status: "stable", contributesToScore: true, contributesToScoreWhenFiltered: true }),
    ];
    expect(resolveStableSubAxes(axes, { filterRan: false }).has("a.both")).toBe(true);
    expect(resolveStableSubAxes(axes, { filterRan: true }).has("a.both")).toBe(true);
  });

  it("returns an empty set for empty input", () => {
    expect(resolveStableSubAxes([], { filterRan: false }).size).toBe(0);
    expect(resolveStableSubAxes([], { filterRan: true }).size).toBe(0);
  });

  it("mechanism is inert on the real catalogue — filterRan has no effect today", () => {
    const withFilter = resolveStableSubAxes(SUB_AXES, { filterRan: true });
    const withoutFilter = resolveStableSubAxes(SUB_AXES, { filterRan: false });
    expect(withFilter).toEqual(withoutFilter);
  });
});
