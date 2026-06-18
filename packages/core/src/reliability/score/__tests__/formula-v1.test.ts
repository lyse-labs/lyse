import { describe, expect, it } from "vitest";
import { computeScoreV1 } from "../formula-v1.js";
import type { Finding } from "../../types.js";

const sample: Finding[] = [
  { ruleId: "tokens/no-hardcoded-color", subAxisId: "tokens.color", severity: "error", confidence: "high", message: "", file: "Button.tsx", line: 1, column: null },
  { ruleId: "a11y/essentials", subAxisId: "a11y.essentials", severity: "warning", confidence: "high", message: "", file: "Card.tsx", line: 1, column: null },
];

describe("scoring-v1", () => {
  it("returns 100 with no findings", () => {
    const r = computeScoreV1({ findings: [], stableSubAxes: new Set(), confidenceByAxis: {} });
    expect(r.score).toBe(100);
    expect(r.version).toBe("scoring-v1");
  });
  it("only weights stable sub-axes", () => {
    const r = computeScoreV1({
      findings: sample,
      stableSubAxes: new Set(["tokens.color"]),
      confidenceByAxis: { "tokens.color": 1.0, "a11y.essentials": 1.0 },
    });
    expect(r.score).toBeLessThan(100);
    expect(r.findingsCountedInScore).toBe(1);
    expect(r.findingsReportedOnly).toBe(1);
  });
  it("deterministic — same input → same score", () => {
    const a = computeScoreV1({ findings: sample, stableSubAxes: new Set(["tokens.color"]), confidenceByAxis: { "tokens.color": 1.0 } });
    const b = computeScoreV1({ findings: sample, stableSubAxes: new Set(["tokens.color"]), confidenceByAxis: { "tokens.color": 1.0 } });
    expect(a.score).toBe(b.score);
  });
});

describe("scoring-v1 ai-governance grace ramp (#89 / ADR-0018)", () => {
  const govFindings: Finding[] = [
    { ruleId: "ai-governance/disclaimer-present", subAxisId: "ai-governance.disclaimer-present", severity: "warning", confidence: "high", message: "", file: "AIBadge.tsx", line: 1, column: null },
    { ruleId: "ai-governance/feedback-control-present", subAxisId: "ai-governance.feedback-control-present", severity: "warning", confidence: "high", message: "", file: "AIBadge.tsx", line: 1, column: null },
  ];
  const stable = new Set(["ai-governance.disclaimer-present", "ai-governance.feedback-control-present"]);
  const conf = { "ai-governance.disclaimer-present": 1.0, "ai-governance.feedback-control-present": 1.0 };

  it("grace 1 (default/inert) penalizes ai-governance findings fully", () => {
    const full = computeScoreV1({ findings: govFindings, stableSubAxes: stable, confidenceByAxis: conf });
    const explicit1 = computeScoreV1({ findings: govFindings, stableSubAxes: stable, confidenceByAxis: conf, aiGovernanceGrace: 1 });
    expect(explicit1.score).toBe(full.score);
    expect(full.score).toBeLessThan(100);
  });

  it("a low grace factor (nascent AI surface) barely dents the score", () => {
    const graced = computeScoreV1({ findings: govFindings, stableSubAxes: stable, confidenceByAxis: conf, aiGovernanceGrace: 0.2 });
    const full = computeScoreV1({ findings: govFindings, stableSubAxes: stable, confidenceByAxis: conf, aiGovernanceGrace: 1 });
    expect(graced.score).toBeGreaterThan(full.score);
    expect(graced.score).toBeGreaterThanOrEqual(95); // one AIBadge must not crater
    // findings are still COUNTED (reported), only their penalty is scaled
    expect(graced.findingsCountedInScore).toBe(2);
  });

  it("grace does NOT touch non-ai-governance findings", () => {
    const mixed: Finding[] = [
      { ruleId: "tokens/no-hardcoded-color", subAxisId: "tokens.color", severity: "error", confidence: "high", message: "", file: "x.tsx", line: 1, column: null },
    ];
    const a = computeScoreV1({ findings: mixed, stableSubAxes: new Set(["tokens.color"]), confidenceByAxis: { "tokens.color": 1.0 }, aiGovernanceGrace: 0.2 });
    const b = computeScoreV1({ findings: mixed, stableSubAxes: new Set(["tokens.color"]), confidenceByAxis: { "tokens.color": 1.0 }, aiGovernanceGrace: 1 });
    expect(a.score).toBe(b.score);
  });
});

describe("scoring-v1 conformal gate (Phase D, D-gov-2a)", () => {
  const gov = (msg: string, conf?: number): Finding => ({
    ruleId: "ai-governance/disclaimer-present",
    subAxisId: "ai-governance.disclaimer-present",
    severity: "warning",
    confidence: "high",
    message: msg,
    file: "Chat.tsx",
    line: 1,
    column: null,
    ...(conf !== undefined ? { llmJudgement: { verdict: "violation" as const, confidence: conf } } : {}),
  } as Finding);

  const conformal = new Map([["ai-governance.disclaimer-present", 0.7]]);
  const confidenceByAxis = { "ai-governance.disclaimer-present": 1.0 };

  it("counts a conformal finding only when confidence ≥ threshold", () => {
    const r = computeScoreV1({
      findings: [gov("confident", 0.85)],
      stableSubAxes: new Set(),
      conformalSubAxes: conformal,
      confidenceByAxis,
    });
    expect(r.findingsCountedInScore).toBe(1);
    expect(r.findingsReportedOnly).toBe(0);
    expect(r.score).toBeLessThan(100);
  });

  it("reports-only a conformal finding below threshold", () => {
    const r = computeScoreV1({
      findings: [gov("unsure", 0.4)],
      stableSubAxes: new Set(),
      conformalSubAxes: conformal,
      confidenceByAxis,
    });
    expect(r.findingsCountedInScore).toBe(0);
    expect(r.findingsReportedOnly).toBe(1);
    expect(r.score).toBe(100);
  });

  it("reports-only a conformal finding with no llmJudgement", () => {
    const r = computeScoreV1({
      findings: [gov("ungraded")],
      stableSubAxes: new Set(),
      conformalSubAxes: conformal,
      confidenceByAxis,
    });
    expect(r.findingsCountedInScore).toBe(0);
    expect(r.findingsReportedOnly).toBe(1);
  });

  it("is inert when no conformalSubAxes map is passed (byte-identical to today)", () => {
    const withMap = computeScoreV1({ findings: sample, stableSubAxes: new Set(["tokens.color"]), confidenceByAxis: { "tokens.color": 1.0 } });
    const base = computeScoreV1({ findings: sample, stableSubAxes: new Set(["tokens.color"]), confidenceByAxis: { "tokens.color": 1.0 }, conformalSubAxes: new Map() });
    expect(base.score).toBe(withMap.score);
    expect(base.findingsCountedInScore).toBe(withMap.findingsCountedInScore);
  });
});

describe("scoring-v1 mutation hardening (#104)", () => {
  it("computes an EXACT score for a known penalty (kills the *1.5 arithmetic mutant)", () => {
    // 1 stable warning, confidence 1.0 → penalty = 2*1.0 = 2 → score = round(100 - 2*1.5) = 97.
    const findings: Finding[] = [
      { ruleId: "a11y/essentials", subAxisId: "a11y.essentials", severity: "warning", confidence: "high", message: "", file: "a", line: 1, column: null },
    ];
    const r = computeScoreV1({ findings, stableSubAxes: new Set(["a11y.essentials"]), confidenceByAxis: { "a11y.essentials": 1.0 } });
    expect(r.score).toBe(97);
  });

  it("conformal gate counts a finding whose confidence EQUALS the threshold (kills > vs >=)", () => {
    const f: Finding = {
      ruleId: "ai-governance/disclaimer-present", subAxisId: "ai-governance.disclaimer-present",
      severity: "warning", confidence: "high", message: "", file: "a", line: 1, column: null,
      llmJudgement: { verdict: "violation", confidence: 0.7 },
    };
    const r = computeScoreV1({
      findings: [f], stableSubAxes: new Set(),
      conformalSubAxes: new Map([["ai-governance.disclaimer-present", 0.7]]),
      confidenceByAxis: { "ai-governance.disclaimer-present": 1.0 },
    });
    expect(r.findingsCountedInScore).toBe(1); // conf === theta must count
  });
});
