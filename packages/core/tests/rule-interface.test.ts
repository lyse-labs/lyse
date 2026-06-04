import { describe, it, expect } from "vitest";
import type { Rule, Finding, ClassifyContext, CodemodContext, CodemodResult } from "../src/types.js";

describe("Rule interface extensions", () => {
  it("accepts optional classifyConfidence", () => {
    const r: Rule = {
      id: "tokens/no-hardcoded-color",
      axis: "tokens",
      evaluate: async () => ({ findings: [], opportunities: 0 }),
      classifyConfidence: (_f, _ctx) => "high",
    };
    expect(r.classifyConfidence?.({} as Finding, {} as ClassifyContext)).toBe("high");
  });

  it("accepts optional applyCodemod", () => {
    const result: CodemodResult = {
      diff: "",
      importsAdded: [],
      confidence: "high",
    };
    const r: Rule = {
      id: "tokens/no-hardcoded-color",
      axis: "tokens",
      evaluate: async () => ({ findings: [], opportunities: 0 }),
      applyCodemod: (_f, _ctx) => result,
    };
    expect(r.applyCodemod?.({} as Finding, {} as CodemodContext)).toEqual(result);
  });

  it("works without either (non-fixable rules)", () => {
    const r: Rule = {
      id: "a11y/essentials",
      axis: "a11y",
      evaluate: async () => ({ findings: [], opportunities: 0 }),
    };
    expect(r.classifyConfidence).toBeUndefined();
    expect(r.applyCodemod).toBeUndefined();
  });
});
