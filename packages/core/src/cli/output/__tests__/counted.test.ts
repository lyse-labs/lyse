import { describe, it, expect } from "vitest";
import { countedFindingPredicate, countedFromAxes } from "../counted.js";
import type { AuditResult, AxisScore, Finding } from "../../../types.js";

function finding(ruleId: string, axis: Finding["axis"]): Finding {
  return {
    ruleId,
    axis,
    severity: "error",
    message: "m",
    location: { file: "a.tsx", line: 1, column: 1 },
  } as Finding;
}

function axis(a: AxisScore["axis"], score: number | "N/A", findings: number): AxisScore {
  return { axis: a, score, findings, opportunities: 100 };
}

function result(partial: Partial<AuditResult>): AuditResult {
  return { findings: [], axes: [], finalScore: 0, ...partial } as unknown as AuditResult;
}

describe("countedFindingPredicate", () => {
  it("does not count a finding on an abstaining axis", () => {
    const r = result({ axes: [axis("tokens", "N/A", 1)] });
    expect(countedFindingPredicate(r)(finding("tokens/no-hardcoded-color", "tokens"))).toBe(false);
  });

  it("does not count a rule outside the score-contributing set", () => {
    const r = result({ axes: [axis("tokens", 80, 3)] });
    expect(countedFindingPredicate(r)(finding("tokens/not-a-real-rule", "tokens"))).toBe(false);
  });

  it("ignores `confidence`, which the scorers do not read", () => {
    const r = result({ axes: [axis("a11y", 68, 20)] });
    const f = { ...finding("a11y/interactive-role-name", "a11y"), confidence: "low" } as Finding;
    const g = { ...finding("a11y/interactive-role-name", "a11y"), confidence: "high" } as Finding;
    const isCounted = countedFindingPredicate(r);
    expect(isCounted(f)).toBe(isCounted(g));
  });

  // Paired on purpose: without the "ok" half, this passes for a rule that is
  // simply not score-contributing, which proves nothing about the blocking.
  it("does not count a rule blocked by a degraded extractor, and does when it is not", () => {
    const withStatus = (status: string) =>
      result({
        axes: [axis("tokens", 80, 3)],
        meta: { extraction: { entries: [{ extractor: "components", status, evidence: {} }] } },
      } as unknown as Partial<AuditResult>);
    const f = finding("tokens/no-hardcoded-spacing", "tokens");
    expect(countedFindingPredicate(withStatus("ok"))(f)).toBe(true);
    expect(countedFindingPredicate(withStatus("degraded"))(f)).toBe(false);
  });
});

describe("countedFromAxes", () => {
  it("sums only the axes that produced a score", () => {
    const r = result({
      axes: [axis("tokens", "N/A", 1), axis("a11y", 68, 20), axis("components", 99, 5)],
    });
    expect(countedFromAxes(r)).toBe(25);
  });

  it("is zero when every axis abstains", () => {
    expect(countedFromAxes(result({ axes: [axis("tokens", "N/A", 9)] }))).toBe(0);
  });
});
