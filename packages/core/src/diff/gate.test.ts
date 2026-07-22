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
});
