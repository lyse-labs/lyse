import { describe, it, expect } from "vitest";
import { detectAxeFindings, rule } from "../../src/rules/a11y-runtime-axe.js";
import type { AxeViolation } from "../../src/render/axe-runner.js";
import type { RuleContext, ParsedFiles } from "../../src/types.js";

const emptyParsed: ParsedFiles = { ts: [], css: [], cssInJs: [] };
const baseCtx: RuleContext = {
  repoRoot: "/x",
  tokens: null,
  componentsModule: null,
  componentInventory: [],
  storyIndex: null,
  excludePaths: [],
};

describe("detectAxeFindings", () => {
  it("maps critical/serious to error and moderate/minor to warning", () => {
    const violations: AxeViolation[] = [
      { ruleId: "image-alt", impact: "critical", nodes: 2, help: "Images must have alternate text" },
      { ruleId: "color-contrast", impact: "moderate", nodes: 1, help: "Elements must have sufficient color contrast" },
    ];
    const findings = detectAxeFindings(violations);
    expect(findings).toHaveLength(2);
    expect(findings[0]!.severity).toBe("error");
    expect(findings[0]!.ruleId).toBe("a11y/runtime-axe");
    expect(findings[0]!.message).toContain("image-alt");
    expect(findings[1]!.severity).toBe("warning");
  });

  it("returns no findings for an empty violation list", () => {
    expect(detectAxeFindings([])).toEqual([]);
  });
});

describe("a11y/runtime-axe rule", () => {
  it("is N/A (opportunities 0) when no axe data is present", async () => {
    const res = await rule.evaluate(baseCtx, emptyParsed);
    expect(res).toEqual({ findings: [], opportunities: 0 });
  });

  it("emits one finding per violation and counts stories probed as opportunities", async () => {
    const ctx: RuleContext = {
      ...baseCtx,
      axeViolations: [{ ruleId: "image-alt", impact: "serious", nodes: 1, help: "alt text" }],
      axeStoriesProbed: 3,
    };
    const res = await rule.evaluate(ctx, emptyParsed);
    expect(res.findings).toHaveLength(1);
    expect(res.opportunities).toBe(3);
  });
});
