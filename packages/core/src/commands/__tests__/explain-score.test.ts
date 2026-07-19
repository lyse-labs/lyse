import { describe, expect, it } from "vitest";
import { formatExplainScore } from "../explain-score.js";
import type { Finding } from "../../reliability/types.js";
import type { AxisScore } from "../../types.js";

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

const NO_AXES: AxisScore[] = [];

describe("formatExplainScore", () => {
  it("headline number IS the passed-in finalScore/scoringVersion (H4: never recomputed locally)", () => {
    const r = formatExplainScore({
      findings: [],
      stableSubAxes: new Set(),
      confidenceByAxis: {},
      finalScore: 87,
      scoringVersion: "scoring-v2",
      axes: NO_AXES,
    });
    expect(r.score).toBe(87);
    expect(r.version).toBe("scoring-v2");
    expect(r.rawText).toContain("Health Score: 87 / 100  ·  scoring-v2");
  });

  it("reports 'No findings' when the finding list is empty", () => {
    const r = formatExplainScore({
      findings: [],
      stableSubAxes: new Set(),
      confidenceByAxis: {},
      finalScore: 100,
      scoringVersion: "scoring-v2",
      axes: NO_AXES,
    });
    expect(r.rawText).toContain("No findings");
  });

  it("renders 'N/A' headline when finalScore is N/A (insufficient sample)", () => {
    const r = formatExplainScore({
      findings: [],
      stableSubAxes: new Set(),
      confidenceByAxis: {},
      finalScore: "N/A",
      scoringVersion: "scoring-v2",
      axes: NO_AXES,
    });
    expect(r.score).toBe("N/A");
    expect(r.rawText).toContain("Health Score: N/A  ·  scoring-v2");
  });

  it("renders a gap report: score gap (points recoverable) + maturity next-rung", () => {
    const finding = {
      ruleId: "tokens/dtcg-conformance",
      subAxisId: "tokens.dtcg-conformance",
      severity: "error" as const,
      confidence: "high" as const,
      message: "x",
      file: "a.json",
      line: 1,
      column: 1,
    };
    const r = formatExplainScore({
      findings: [finding],
      stableSubAxes: new Set(["tokens.dtcg-conformance"]),
      confidenceByAxis: { "tokens.dtcg-conformance": 1 },
      finalScore: 94,
      scoringVersion: "scoring-v2",
      axes: NO_AXES,
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
    expect(r.rawText).toContain("How to improve:");
    expect(r.gapReport.scoreGaps[0]!.subAxisId).toBe("tokens.dtcg-conformance");
    expect(r.gapReport.scoreGaps[0]!.pointsRecoverable).toBe(6); // round(error_weight 4 × conf 1 × 1.5)
    expect(r.gapReport.maturityGap!.nextLevel).toBe(3);
    expect(r.rawText).toContain("L2 → L3");
    expect(r.rawText).toContain("HAX / PAIR");
  });

  it("renders the AI-Governance Maturity line with detail when maturity is provided", () => {
    const r = formatExplainScore({
      findings: [],
      stableSubAxes: new Set(),
      confidenceByAxis: {},
      finalScore: 100,
      scoringVersion: "scoring-v2",
      axes: NO_AXES,
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
      finalScore: 100,
      scoringVersion: "scoring-v2",
      axes: NO_AXES,
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
      finalScore: 100,
      scoringVersion: "scoring-v2",
      axes: NO_AXES,
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
    const r = formatExplainScore({
      findings: [],
      stableSubAxes: new Set(),
      confidenceByAxis: {},
      finalScore: 100,
      scoringVersion: "scoring-v2",
      axes: NO_AXES,
    });
    expect(r.rawText).not.toContain("AI-Governance Maturity");
    expect(r.maturityLevel).toBeUndefined();
  });

  it("does not describe formula-v1 (penalty × 1.5) or a score-v2 preview line — the score is the audit's, not a local formula", () => {
    const r = formatExplainScore({
      findings: [],
      stableSubAxes: new Set(),
      confidenceByAxis: {},
      finalScore: 100,
      scoringVersion: "scoring-v2",
      axes: NO_AXES,
    });
    expect(r.rawText).not.toContain("Formula:");
    expect(r.rawText).not.toContain("penalty × 1.5");
    expect(r.rawText).not.toContain("score-v2 preview");
  });

  it("buckets findings by sub-axis with name, count, confidence weight, and penalty", () => {
    const findings = [F({}), F({ severity: "warning" })];
    const r = formatExplainScore({
      findings,
      stableSubAxes: new Set(["tokens.color"]),
      confidenceByAxis: { "tokens.color": 1.0 },
      finalScore: 88,
      scoringVersion: "scoring-v2",
      axes: NO_AXES,
    });
    expect(r.buckets).toHaveLength(1);
    expect(r.buckets[0]!.subAxisId).toBe("tokens.color");
    expect(r.buckets[0]!.countedFindings).toBe(2);
    expect(r.buckets[0]!.confidence).toBe(1.0);
    expect(r.buckets[0]!.penalty).toBe(6);
    expect(r.countedTotal).toBe(2);
    expect(r.reportedOnlyTotal).toBe(0);
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
      finalScore: 100,
      scoringVersion: "scoring-v2",
      axes: NO_AXES,
    });
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
      finalScore: 80,
      scoringVersion: "scoring-v2",
      axes: NO_AXES,
    });
    expect(r.buckets[0]!.status).toBe("stable");
    expect(r.buckets[1]!.status).toBe("stable");
    expect(r.buckets[2]!.status).not.toBe("stable");
    expect(r.buckets[0]!.subAxisId).toBe("a11y.essentials");
    expect(r.buckets[1]!.subAxisId).toBe("tokens.color");
  });

  describe("per-axis adoption breakdown", () => {
    it("renders a ratio sentence for a scored axis", () => {
      const r = formatExplainScore({
        findings: [],
        stableSubAxes: new Set(),
        confidenceByAxis: {},
        finalScore: 90,
        scoringVersion: "scoring-v2",
        axes: [{ axis: "tokens", score: 90, findings: 2, opportunities: 20 }],
      });
      expect(r.rawText).toContain("• tokens: 90% adoption (18/20 usages)");
    });

    it("renders an insufficient-sample sentence for N/A with opportunities > 0", () => {
      const r = formatExplainScore({
        findings: [],
        stableSubAxes: new Set(),
        confidenceByAxis: {},
        finalScore: "N/A",
        scoringVersion: "scoring-v2",
        axes: [{ axis: "a11y", score: "N/A", findings: 0, opportunities: 3 }],
      });
      expect(r.rawText).toContain("• a11y: insufficient sample (n=3) — not scored");
    });

    it("renders a not-scored sentence for an axis with zero opportunities", () => {
      const r = formatExplainScore({
        findings: [],
        stableSubAxes: new Set(),
        confidenceByAxis: {},
        finalScore: "N/A",
        scoringVersion: "scoring-v2",
        axes: [{ axis: "stories", score: "N/A", findings: 0, opportunities: 0 }],
      });
      expect(r.rawText).toContain("• stories: not scored — no stories opportunities in scope");
    });

    it("clamps 'clean' usages at 0 when findings exceed opportunities", () => {
      const r = formatExplainScore({
        findings: [],
        stableSubAxes: new Set(),
        confidenceByAxis: {},
        finalScore: 50,
        scoringVersion: "scoring-v2",
        axes: [{ axis: "components", score: 50, findings: 5, opportunities: 2 }],
      });
      expect(r.rawText).toContain("• components: 50% adoption (0/2 usages)");
    });
  });
});
