import { describe, expect, it } from "vitest";
import { formatExplainScore } from "../explain-score.js";
import type { Finding } from "../../reliability/types.js";

const F = (overrides: Partial<Finding>): Finding => ({
  ruleId: "tokens/no-hardcoded-color",
  subAxisId: "tokens.color",
  severity: "error",
  confidence: "high",
  message: "literal #fff",
  file: "Button.tsx",
  line: 1,
  column: 1,
  ...overrides,
});

describe("formatExplainScore", () => {
  it("reports 100 / 100 and 'No findings' when the finding list is empty", () => {
    const r = formatExplainScore({ findings: [], stableSubAxes: new Set(), confidenceByAxis: {} });
    expect(r.score).toBe(100);
    expect(r.version).toBe("scoring-v1");
    expect(r.rawText).toContain("Health Score: 100 / 100");
    expect(r.rawText).toContain("No findings");
  });

  it("renders the AI-Governance Maturity line with detail when maturity is provided", () => {
    const r = formatExplainScore({
      findings: [],
      stableSubAxes: new Set(),
      confidenceByAxis: {},
      maturity: {
        level: 2,
        signals: {
          hasReservedAiTokens: true,
          hasMarkerComponent: true,
          hasInteractionAffordance: false,
          hasGovernanceAffordance: false,
        },
      },
    });
    expect(r.maturityLevel).toBe(2);
    expect(r.rawText).toContain("AI-Governance Maturity: L2 — AI as a component (AI tokens, marker component)");
  });

  it("marks the maturity line LLM-derived when the LLM tier lifted it", () => {
    const r = formatExplainScore({
      findings: [],
      stableSubAxes: new Set(),
      confidenceByAxis: {},
      maturity: {
        level: 3,
        signals: {
          hasReservedAiTokens: true,
          hasMarkerComponent: true,
          hasInteractionAffordance: true,
          hasGovernanceAffordance: false,
        },
        llmDerived: true,
      },
    });
    expect(r.rawText).toContain("AI-Governance Maturity: L3");
    expect(r.rawText).toContain("·  LLM-derived");
  });

  it("renders L0 'no AI layer' with no detail", () => {
    const r = formatExplainScore({
      findings: [],
      stableSubAxes: new Set(),
      confidenceByAxis: {},
      maturity: {
        level: 0,
        signals: {
          hasReservedAiTokens: false,
          hasMarkerComponent: false,
          hasInteractionAffordance: false,
          hasGovernanceAffordance: false,
        },
      },
    });
    expect(r.rawText).toContain("AI-Governance Maturity: L0 — no AI layer");
  });

  it("omits the maturity line when no maturity is provided (back-compat)", () => {
    const r = formatExplainScore({ findings: [], stableSubAxes: new Set(), confidenceByAxis: {} });
    expect(r.rawText).not.toContain("AI-Governance Maturity");
    expect(r.maturityLevel).toBeUndefined();
  });

  it("includes the pinned scoring-v1 version string", () => {
    const r = formatExplainScore({ findings: [], stableSubAxes: new Set(), confidenceByAxis: {} });
    expect(r.rawText).toContain("scoring-v1");
  });

  it("describes the formula (penalty × 1.5, clamped 0-100)", () => {
    const r = formatExplainScore({ findings: [], stableSubAxes: new Set(), confidenceByAxis: {} });
    expect(r.rawText).toContain("100 - penalty");
    expect(r.rawText).toContain("× 1.5");
  });

  it("buckets findings by sub-axis with name, count, confidence weight, and penalty", () => {
    const findings = [F({}), F({ severity: "warning" })];
    const r = formatExplainScore({
      findings,
      stableSubAxes: new Set(["tokens.color"]),
      confidenceByAxis: { "tokens.color": 1.0 },
    });
    expect(r.score).toBeLessThan(100);
    expect(r.buckets).toHaveLength(1);
    expect(r.buckets[0]!.subAxisId).toBe("tokens.color");
    expect(r.buckets[0]!.countedFindings).toBe(2);
    expect(r.buckets[0]!.confidence).toBe(1.0);
    expect(r.buckets[0]!.penalty).toBe(6);
    expect(r.rawText).toContain("Color tokens");
    expect(r.rawText).toContain("2 findings");
    expect(r.rawText).toContain("confidence 1.00");
  });

  it("lists experimental sub-axes in a 'reported only' section (not counted in score)", () => {
    const findings = [F({ subAxisId: "components.duplication", ruleId: "components.duplication" })];
    const r = formatExplainScore({
      findings,
      stableSubAxes: new Set(),
      confidenceByAxis: {},
    });
    expect(r.score).toBe(100);
    expect(r.countedTotal).toBe(0);
    expect(r.reportedOnlyTotal).toBe(1);
    expect(r.rawText).toContain("Reported only");
    expect(r.rawText).toContain("experimental");
  });

  it("sorts stable buckets before experimental, then by penalty desc", () => {
    const findings = [
      F({ subAxisId: "components.duplication" }),
      F({ subAxisId: "tokens.color", severity: "warning" }),
      F({ subAxisId: "a11y.essentials", severity: "error" }),
    ];
    const r = formatExplainScore({
      findings,
      stableSubAxes: new Set(["tokens.color", "a11y.essentials"]),
      confidenceByAxis: { "tokens.color": 1.0, "a11y.essentials": 1.0 },
    });
    expect(r.buckets[0]!.status).toBe("stable");
    expect(r.buckets[1]!.status).toBe("stable");
    expect(r.buckets[2]!.status).not.toBe("stable");
    expect(r.buckets[0]!.subAxisId).toBe("a11y.essentials");
    expect(r.buckets[1]!.subAxisId).toBe("tokens.color");
  });

  it("clamps the score at 0 when penalties are massive", () => {
    const findings = Array.from({ length: 100 }, () => F({}));
    const r = formatExplainScore({
      findings,
      stableSubAxes: new Set(["tokens.color"]),
      confidenceByAxis: { "tokens.color": 1.0 },
    });
    expect(r.score).toBe(0);
  });
});
