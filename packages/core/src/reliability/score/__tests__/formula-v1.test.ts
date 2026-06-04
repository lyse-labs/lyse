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
