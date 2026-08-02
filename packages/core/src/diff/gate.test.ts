import { describe, it, expect } from "vitest";
import { evaluateGate } from "./gate.js";
import type { Finding } from "../types.js";

const SCORED = new Set(["tokens/no-hardcoded-spacing"]);
function f(ruleId: string): Finding {
  return { ruleId, axis: "tokens", severity: "warning", location: { file: "a.tsx", line: 1, column: 1 }, message: "x" };
}

describe("evaluateGate", () => {
  it("green: no new findings, no regression", () => {
    expect(evaluateGate({ newFindings: [], currentScores: { tokens: 60 }, baseline: { scores: { tokens: 60 } }, scoreContributingRuleIds: SCORED }))
      .toEqual({ fail: false, reasons: [] });
  });
  it("red: a new finding on a score-contributing rule", () => {
    const r = evaluateGate({ newFindings: [f("tokens/no-hardcoded-spacing")], currentScores: { tokens: 60 }, baseline: { scores: { tokens: 60 } }, scoreContributingRuleIds: SCORED });
    expect(r.fail).toBe(true);
  });
  it("green: a new finding on a NON-score-contributing rule does not fail", () => {
    const r = evaluateGate({ newFindings: [f("tokens/no-hardcoded-color")], currentScores: { tokens: 60 }, baseline: { scores: { tokens: 60 } }, scoreContributingRuleIds: SCORED });
    expect(r.fail).toBe(false);
  });
  it("red: an axis score regressed beyond tolerance", () => {
    const r = evaluateGate({ newFindings: [], currentScores: { tokens: 58 }, baseline: { scores: { tokens: 60 } }, scoreContributingRuleIds: SCORED });
    expect(r.fail).toBe(true);
  });
  it("green: regression within tolerance", () => {
    const r = evaluateGate({ newFindings: [], currentScores: { tokens: 58 }, baseline: { scores: { tokens: 60 } }, scoreContributingRuleIds: SCORED, scoreTolerance: 3 });
    expect(r.fail).toBe(false);
  });
  it("green: axis improved", () => {
    const r = evaluateGate({ newFindings: [], currentScores: { tokens: 70 }, baseline: { scores: { tokens: 60 } }, scoreContributingRuleIds: SCORED });
    expect(r.fail).toBe(false);
  });
  it("red: an axis that was scored at baseline is no longer scored at all", () => {
    // The laundering path. `cli.ts` drops non-numeric scores when building
    // `currentScores`, so an axis that N/A'd out arrives here as `undefined`.
    // The old `typeof cur === "number"` guard skipped it and the gate went
    // green while the headline score ROSE — measured on real repos: cruip
    // 80 → 92, shadcn 86 → 93 after deleting enough of the design system to
    // push the axis under the minimum-sample guard.
    const r = evaluateGate({ newFindings: [], currentScores: {}, baseline: { scores: { tokens: 84 } }, scoreContributingRuleIds: SCORED });
    expect(r.fail).toBe(true);
    expect(r.reasons.join(" ")).toContain("tokens");
  });
  it("red: no tolerance can excuse an axis that stopped being scored", () => {
    const r = evaluateGate({ newFindings: [], currentScores: {}, baseline: { scores: { tokens: 84 } }, scoreContributingRuleIds: SCORED, scoreTolerance: 100 });
    expect(r.fail).toBe(true);
  });
  it("red: names every axis that stopped being scored, not just the first", () => {
    const r = evaluateGate({ newFindings: [], currentScores: { tokens: 84 }, baseline: { scores: { tokens: 84, components: 70, a11y: 60 } }, scoreContributingRuleIds: SCORED });
    expect(r.reasons.join(" ")).toContain("components");
    expect(r.reasons.join(" ")).toContain("a11y");
  });
  it("green: an axis absent from the baseline and absent today is not a regression", () => {
    const r = evaluateGate({ newFindings: [], currentScores: { tokens: 84 }, baseline: { scores: { tokens: 84 } }, scoreContributingRuleIds: SCORED });
    expect(r).toEqual({ fail: false, reasons: [] });
  });
});
