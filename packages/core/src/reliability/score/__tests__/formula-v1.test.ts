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
