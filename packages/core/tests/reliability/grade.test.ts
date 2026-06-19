import { describe, it, expect } from "vitest";
import { computeGrade } from "../../src/reliability/grade.js";

describe("computeGrade — bands", () => {
  it("A at >= 80, B at >= 60, C at >= 40, Fail below 40", () => {
    expect(computeGrade(85).grade).toBe("A");
    expect(computeGrade(65).grade).toBe("B");
    expect(computeGrade(45).grade).toBe("C");
    expect(computeGrade(30).grade).toBe("Fail");
  });

  it("uses inclusive lower boundaries (80→A, 60→B, 40→C, 39→Fail)", () => {
    expect(computeGrade(80).grade).toBe("A");
    expect(computeGrade(60).grade).toBe("B");
    expect(computeGrade(40).grade).toBe("C");
    expect(computeGrade(39).grade).toBe("Fail");
  });

  it("returns N/A when the score is N/A", () => {
    expect(computeGrade("N/A").grade).toBe("N/A");
  });

  it("does not auto-fail or mark reasons when no autoFail passed", () => {
    const r = computeGrade(90);
    expect(r.autoFailed).toBe(false);
    expect(r.reasons).toEqual([]);
  });
});

describe("computeGrade — auto-fail passthrough", () => {
  it("marks autoFailed + Fail when autoFail reasons are passed (scorer already capped the score)", () => {
    const r = computeGrade(39, { reasons: ["2 axes scored 0: a11y, components"] });
    expect(r.grade).toBe("Fail");
    expect(r.autoFailed).toBe(true);
    expect(r.reasons).toEqual(["2 axes scored 0: a11y, components"]);
  });

  it("computeGrade(39, autoFail) with a capped score produces Fail by both band and flag", () => {
    const r = computeGrade(39, { reasons: ["x"] });
    expect(r.grade).toBe("Fail");
    expect(r.autoFailed).toBe(true);
    expect(r.reasons).toEqual(["x"]);
  });

  it("computeGrade(85) without autoFail produces A with no reasons", () => {
    const r = computeGrade(85);
    expect(r.grade).toBe("A");
    expect(r.autoFailed).toBe(false);
    expect(r.reasons).toEqual([]);
  });

  it("computeGrade(N/A) produces N/A with no reasons", () => {
    const r = computeGrade("N/A");
    expect(r.grade).toBe("N/A");
    expect(r.autoFailed).toBe(false);
    expect(r.reasons).toEqual([]);
  });
});

describe("computeGrade N/A path (mutation hardening #104)", () => {
  it("returns exactly { grade: N/A, autoFailed: false, reasons: [] } for an N/A score", () => {
    const g = computeGrade("N/A");
    expect(g.grade).toBe("N/A");
    expect(g.autoFailed).toBe(false);
    expect(g.reasons).toEqual([]);
  });
});
