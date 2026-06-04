import { describe, it, expect } from "vitest";
import { rule } from "../../src/rules/storybook-coverage.js";
import type { RuleContext, ParsedFiles, StoryIndex } from "../../src/types.js";

const storyIndex: StoryIndex = {
  byTitle: new Map([
    ["Button", { id: "components-button", importPath: "src/Button.tsx" }],
  ]),
};

const ctx: RuleContext = {
  repoRoot: "/r",
  tokens: null,
  componentsModule: "@acme/ui",
  componentInventory: [
    { name: "Button", module: "@acme/ui", usageCount: 47 },
    { name: "DataTable", module: "@acme/ui", usageCount: 5 },
  ],
  storyIndex,
  excludePaths: [],
};

describe("rule stories/coverage", () => {
  it("flags DS components used in app code but with no story", async () => {
    const parsed: ParsedFiles = { ts: [], css: [], cssInJs: [] };
    const result = await rule.evaluate(ctx, parsed);
    const messages = result.findings.map((f) => f.message);
    expect(messages.find((m) => m.includes("DataTable"))).toBeDefined();
    expect(messages.find((m) => m.includes("Button"))).toBeUndefined();
  });

  it("returns no findings + opportunities=0 when storyIndex is null", async () => {
    const result = await rule.evaluate(
      { ...ctx, storyIndex: null },
      { ts: [], css: [], cssInJs: [] }
    );
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });
});

describe("stories/coverage in DS-self mode", () => {
  it("returns 0 opportunities and no findings when dsSelfMode is true", async () => {
    // DS repos may have stories in non-standard locations/formats. Skip entirely.
    const dsSelfCtx: RuleContext = { ...ctx, dsSelfMode: true };
    const result = await rule.evaluate(dsSelfCtx, { ts: [], css: [], cssInJs: [] });
    expect(result.opportunities).toBe(0);
    expect(result.findings).toEqual([]);
  });

  it("non-dsSelfMode still flags missing stories as normal", async () => {
    const result = await rule.evaluate({ ...ctx, dsSelfMode: false }, { ts: [], css: [], cssInJs: [] });
    const messages = result.findings.map((f) => f.message);
    expect(messages.find((m) => m.includes("DataTable"))).toBeDefined();
  });
});
