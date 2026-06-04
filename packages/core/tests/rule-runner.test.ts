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
});
