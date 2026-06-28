import { describe, it, expect } from "vitest";
import { rule } from "../../src/rules/stories-usage-examples.js";
import type { RuleContext, ParsedFiles, StoryIndex, StoryEntry } from "../../src/types.js";

const EMPTY: ParsedFiles = { ts: [], css: [], cssInJs: [] };

function ctxWith(byTitle: Map<string, StoryEntry>, overrides: Partial<RuleContext> = {}): RuleContext {
  const storyIndex: StoryIndex = { byTitle };
  return {
    repoRoot: "/r",
    tokens: null,
    componentsModule: "@acme/ui",
    componentInventory: [{ name: "Button", module: "@acme/ui", usageCount: 5 }],
    storyIndex,
    excludePaths: [],
    ...overrides,
  };
}

describe("rule stories/usage-examples", () => {
  it("does NOT flag a story with two or more named exports", async () => {
    const ctx = ctxWith(new Map([["Button", { id: "b", importPath: "x", stories: [{ name: "Primary" }, { name: "Secondary" }] }]]));
    const res = await rule.evaluate(ctx, EMPTY);
    expect(res.opportunities).toBe(1);
    expect(res.findings).toHaveLength(0);
  });

  it("does NOT flag a single export that carries args", async () => {
    const ctx = ctxWith(new Map([["Button", { id: "b", importPath: "x", stories: [{ name: "Primary", args: { variant: "primary" } }] }]]));
    const res = await rule.evaluate(ctx, EMPTY);
    expect(res.findings).toHaveLength(0);
  });

  it("flags a single bare export with no args", async () => {
    const ctx = ctxWith(new Map([["Button", { id: "b", importPath: "x", stories: [{ name: "Primary" }] }]]));
    const res = await rule.evaluate(ctx, EMPTY);
    expect(res.findings.map((f) => f.message).some((m) => m.includes("Button"))).toBe(true);
  });

  it("flags a story with zero named exports", async () => {
    const ctx = ctxWith(new Map([["Button", { id: "b", importPath: "x" }]]));
    const res = await rule.evaluate(ctx, EMPTY);
    expect(res.findings).toHaveLength(1);
  });

  it("returns opportunities 0 when storyIndex is null", async () => {
    const res = await rule.evaluate(ctxWith(new Map(), { storyIndex: null }), EMPTY);
    expect(res.opportunities).toBe(0);
    expect(res.findings).toHaveLength(0);
  });

  it("returns opportunities 0 in dsSelfMode", async () => {
    const ctx = ctxWith(new Map([["Button", { id: "b", importPath: "x", stories: [{ name: "Primary" }] }]]), { dsSelfMode: true });
    const res = await rule.evaluate(ctx, EMPTY);
    expect(res.opportunities).toBe(0);
  });
});
