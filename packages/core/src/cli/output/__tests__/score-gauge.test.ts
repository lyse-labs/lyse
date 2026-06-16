import { describe, it, expect } from "vitest";
import { renderScoreGauge } from "../score-gauge.js";

describe("renderScoreGauge — grade", () => {
  it("appends the letter grade when provided", () => {
    const out = renderScoreGauge(85, "scoring-v1", 3, 0, { grade: { grade: "A", autoFailed: false } });
    expect(out).toContain("Grade A");
    expect(out).not.toContain("auto-fail");
  });

  it("marks an auto-fail", () => {
    const out = renderScoreGauge(40, "scoring-v1", 2, 0, { grade: { grade: "Fail", autoFailed: true } });
    expect(out).toContain("Grade Fail (auto-fail)");
  });

  it("omits the grade when N/A or absent", () => {
    expect(renderScoreGauge("N/A", "scoring-v1", 0, 0, { grade: { grade: "N/A", autoFailed: false } })).not.toContain("Grade");
    expect(renderScoreGauge(85, "scoring-v1", 0, 0)).not.toContain("Grade");
  });
});
