import { describe, it, expect } from "vitest";
import { computeGrade } from "../../src/reliability/grade.js";
import type { AxisScore, AxisName } from "../../src/types.js";

function ax(axis: AxisName, score: number | "N/A"): AxisScore {
  return { axis, score, findings: 0, opportunities: 0 };
}

describe("computeGrade — bands", () => {
  it("A at >= 80, B at >= 60, C at >= 40, Fail below 40", () => {
    expect(computeGrade(85, []).grade).toBe("A");
    expect(computeGrade(65, []).grade).toBe("B");
    expect(computeGrade(45, []).grade).toBe("C");
    expect(computeGrade(30, []).grade).toBe("Fail");
  });

  it("uses inclusive lower boundaries (80→A, 60→B, 40→C, 39→Fail)", () => {
    expect(computeGrade(80, []).grade).toBe("A");
    expect(computeGrade(60, []).grade).toBe("B");
    expect(computeGrade(40, []).grade).toBe("C");
    expect(computeGrade(39, []).grade).toBe("Fail");
  });

  it("returns N/A when the score is N/A", () => {
    expect(computeGrade("N/A", []).grade).toBe("N/A");
  });

  it("does not auto-fail or mark reasons on a clean high score", () => {
    const r = computeGrade(90, [ax("tokens", 90), ax("a11y", 100)]);
    expect(r.autoFailed).toBe(false);
    expect(r.reasons).toEqual([]);
  });
});

describe("computeGrade — auto-fail", () => {
  it("forces Fail when two or more axes score 0, regardless of overall score", () => {
    const r = computeGrade(88, [ax("a11y", 0), ax("components", 0), ax("tokens", 90)]);
    expect(r.grade).toBe("Fail");
    expect(r.autoFailed).toBe(true);
    expect(r.reasons.join(" ")).toMatch(/a11y/);
    expect(r.reasons.join(" ")).toMatch(/components/);
  });

  it("does not auto-fail on a single zero axis", () => {
    const r = computeGrade(85, [ax("a11y", 0), ax("tokens", 90)]);
    expect(r.autoFailed).toBe(false);
    expect(r.grade).toBe("A");
  });

  it("does not count N/A axes as zeros", () => {
    const r = computeGrade(85, [ax("a11y", "N/A"), ax("components", "N/A"), ax("tokens", 90)]);
    expect(r.autoFailed).toBe(false);
    expect(r.grade).toBe("A");
  });

  it("lists zero axes deterministically (sorted)", () => {
    const r = computeGrade(50, [ax("stories", 0), ax("a11y", 0), ax("components", 0)]);
    expect(r.reasons[0]).toContain("a11y, components, stories");
  });
});
