import { describe, it, expect } from "vitest";
import { isValidConfidence, type Finding, type AuditResult, type Rule } from "../src/types.js";

describe("types compile", () => {
  it("Finding shape", () => {
    const f: Finding = {
      ruleId: "tokens/no-hardcoded-color",
      axis: "tokens",
      severity: "warning",
      location: { file: "x.tsx", line: 1, column: 1 },
      message: "hi",
    };
    expect(f.ruleId).toBe("tokens/no-hardcoded-color");
  });
});

describe("Confidence", () => {
  it("accepts 3 valid levels", () => {
    expect(isValidConfidence("high")).toBe(true);
    expect(isValidConfidence("medium")).toBe(true);
    expect(isValidConfidence("low")).toBe(true);
  });
  it("rejects unknown", () => {
    expect(isValidConfidence("HIGH")).toBe(false);
    expect(isValidConfidence("")).toBe(false);
    expect(isValidConfidence(null)).toBe(false);
  });
  it("Finding accepts optional confidence", () => {
    const f: Finding = {
      ruleId: "tokens/no-hardcoded-color",
      axis: "tokens",
      severity: "warning",
      location: { file: "x.tsx", line: 1, column: 1 },
      message: "hi",
      confidence: "high",
    };
    expect(f.confidence).toBe("high");
  });
  it("Finding works without confidence (backward compat)", () => {
    const f: Finding = {
      ruleId: "tokens/no-hardcoded-color",
      axis: "tokens",
      severity: "warning",
      location: { file: "x.tsx", line: 1, column: 1 },
      message: "hi",
    };
    expect(f.confidence).toBeUndefined();
  });
});
