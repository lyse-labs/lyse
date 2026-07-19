import { describe, it, expect } from "vitest";
import { runRules } from "../src/rule-runner.js";
import type { RuleContext, ParsedFiles, Rule } from "../src/types.js";

const ctx: RuleContext = {
  repoRoot: "/r", tokens: null, componentsModule: null,
  componentInventory: [], storyIndex: null, excludePaths: [],
};

describe("runRules", () => {
  it("runs all configured rules and aggregates findings + opportunities", async () => {
    const fakeRule: Rule = {
      id: "tokens/no-hardcoded-color",
      axis: "tokens",
      async evaluate() {
        return {
          findings: [{
            ruleId: "tokens/no-hardcoded-color", axis: "tokens", severity: "warning",
            location: { file: "x", line: 1, column: 1 }, message: "hi",
          }],
          opportunities: 5,
        };
      },
    };
    const parsed: ParsedFiles = { ts: [], css: [], cssInJs: [] };
    const out = await runRules([fakeRule], ctx, parsed);
    expect(out.findings).toHaveLength(1);
    expect(out.opportunitiesByAxis.tokens).toBe(5);
  });

  it("exposes per-rule opportunities alongside per-axis sums", async () => {
    const fakeRule1: Rule = {
      id: "tokens/no-hardcoded-color",
      axis: "tokens",
      async evaluate() {
        return {
          findings: [],
          opportunities: 5,
        };
      },
    };
    const fakeRule2: Rule = {
      id: "a11y/essentials",
      axis: "a11y",
      async evaluate() {
        return {
          findings: [],
          opportunities: 3,
        };
      },
    };
    const parsed: ParsedFiles = { ts: [], css: [], cssInJs: [] };
    const res = await runRules([fakeRule1, fakeRule2], ctx, parsed);

    // every rule that recorded opportunities appears once
    expect(Array.isArray(res.perRuleOpportunities)).toBe(true);
    expect(res.perRuleOpportunities).toHaveLength(2);

    // per-axis sum equals the sum of per-rule opportunities for that axis
    const byAxis: Record<string, number> = {};
    for (const r of res.perRuleOpportunities) {
      byAxis[r.axis] = (byAxis[r.axis] ?? 0) + r.opportunities;
    }
    for (const [axis, sum] of Object.entries(byAxis)) {
      expect(res.opportunitiesByAxis[axis as any]).toBe(sum);
    }
  });
});
