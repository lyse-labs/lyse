import { describe, expect, it } from "vitest";
import { buildKappaReport } from "../kappa-report.js";
import { KAPPA_FIXTURES } from "../../reliability/llm-eval/kappa-fixtures.js";
import { DIVERGENCE_THRESHOLD } from "../../reliability/llm-eval/divergence.js";

describe("KappaReport divergence field", () => {
  it("report includes a divergence array", () => {
    const report = buildKappaReport(KAPPA_FIXTURES, { generatedAt: "2026-06-11T00:00:00.000Z" });
    expect(Array.isArray(report.divergence)).toBe(true);
  });

  it("low-agreement dimension (kappa=0.0) is present in divergence", () => {
    const report = buildKappaReport(KAPPA_FIXTURES, { generatedAt: "2026-06-11T00:00:00.000Z" });
    const flagged = report.divergence.find((d) => d.dimensionId === "low-agreement");
    expect(flagged).toBeDefined();
    expect(flagged!.type).toBe("rule-divergence");
    expect(flagged!.kappa).toBeCloseTo(0.0, 10);
  });

  it("high-agreement dimension (kappa=0.8) is NOT in divergence", () => {
    const report = buildKappaReport(KAPPA_FIXTURES, { generatedAt: "2026-06-11T00:00:00.000Z" });
    const notFlagged = report.divergence.find((d) => d.dimensionId === "high-agreement");
    expect(notFlagged).toBeUndefined();
  });

  it("medium-agreement dimension (kappa=0.5) is NOT in divergence", () => {
    const report = buildKappaReport(KAPPA_FIXTURES, { generatedAt: "2026-06-11T00:00:00.000Z" });
    const notFlagged = report.divergence.find((d) => d.dimensionId === "medium-agreement");
    expect(notFlagged).toBeUndefined();
  });

  it("schema version bumps to kappa/2.0 now that divergence field is present", () => {
    const report = buildKappaReport(KAPPA_FIXTURES, { generatedAt: "2026-06-11T00:00:00.000Z" });
    expect(report.schemaVersion).toBe("kappa/2.0");
  });

  it("divergence diagnostics match DIVERGENCE_THRESHOLD constant", () => {
    const report = buildKappaReport(KAPPA_FIXTURES, { generatedAt: "2026-06-11T00:00:00.000Z" });
    for (const d of report.divergence) {
      expect(d.kappa).toBeLessThan(DIVERGENCE_THRESHOLD);
    }
  });

  it("is deterministic", () => {
    const r1 = buildKappaReport(KAPPA_FIXTURES, { generatedAt: "2026-06-11T00:00:00.000Z" });
    const r2 = buildKappaReport(KAPPA_FIXTURES, { generatedAt: "2026-06-11T00:00:00.000Z" });
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});
