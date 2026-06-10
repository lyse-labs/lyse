import { describe, expect, it } from "vitest";
import { buildKappaReport } from "../kappa-report.js";
import { KAPPA_FIXTURES } from "../../reliability/llm-eval/kappa-fixtures.js";

describe("buildKappaReport", () => {
  it("returns schema version kappa/2.0", () => {
    const report = buildKappaReport(KAPPA_FIXTURES, { generatedAt: "2026-06-10T00:00:00.000Z" });
    expect(report.schemaVersion).toBe("kappa/2.0");
  });

  it("surfaces all three fixture dimensions, sorted alphabetically", () => {
    const report = buildKappaReport(KAPPA_FIXTURES, { generatedAt: "2026-06-10T00:00:00.000Z" });
    expect(report.dimensions.map((d) => d.dimensionId)).toEqual([
      "high-agreement",
      "low-agreement",
      "medium-agreement",
    ]);
  });

  it("high-agreement dimension kappa = 0.8 (exact from fixture)", () => {
    const report = buildKappaReport(KAPPA_FIXTURES, { generatedAt: "2026-06-10T00:00:00.000Z" });
    const high = report.dimensions.find((d) => d.dimensionId === "high-agreement");
    expect(high!.kappa).toBeCloseTo(0.8, 10);
  });

  it("low-agreement dimension kappa = 0.0 (exact from fixture)", () => {
    const report = buildKappaReport(KAPPA_FIXTURES, { generatedAt: "2026-06-10T00:00:00.000Z" });
    const low = report.dimensions.find((d) => d.dimensionId === "low-agreement");
    expect(low!.kappa).toBeCloseTo(0.0, 10);
  });

  it("is deterministic given fixed input", () => {
    const r1 = buildKappaReport(KAPPA_FIXTURES, { generatedAt: "2026-06-10T00:00:00.000Z" });
    const r2 = buildKappaReport(KAPPA_FIXTURES, { generatedAt: "2026-06-10T00:00:00.000Z" });
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});
