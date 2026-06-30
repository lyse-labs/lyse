import { describe, it, expect } from "vitest";
import { rule } from "../../src/rules/stories-props-documented.js";
import type { RuleContext, ParsedFiles, StoryIndex, StoryEntry } from "../../src/types.js";

const EMPTY: ParsedFiles = { ts: [], css: [], cssInJs: [] };

function ctxWith(byTitle: Map<string, StoryEntry>, overrides: Partial<RuleContext> = {}): RuleContext {
  const storyIndex: StoryIndex = { byTitle };
  return {
    repoRoot: "/r",
    tokens: null,
    componentsModule: "@acme/ui",
    componentInventory: [{ name: "Button", module: "@acme/ui", usageCount: 5, props: [{ name: "variant" }] }],
    storyIndex,
    excludePaths: [],
    ...overrides,
  };
}

describe("rule stories/props-documented", () => {
  it("does NOT flag a story that declares argTypes", async () => {
    const ctx = ctxWith(new Map([["Button", { id: "b", importPath: "src/Button.stories.tsx", hasArgTypes: true }]]));
    const res = await rule.evaluate(ctx, EMPTY);
    expect(res.opportunities).toBe(1);
    expect(res.findings).toHaveLength(0);
  });

  it("does NOT flag a story that documents props via meta-level args (CSF3 autodocs)", async () => {
    const ctx = ctxWith(new Map([["Button", { id: "b", importPath: "x", hasArgTypes: false, hasArgs: true, stories: [{ name: "Default" }] }]]));
    const res = await rule.evaluate(ctx, EMPTY);
    expect(res.findings).toHaveLength(0);
  });

  it("does NOT flag a story whose named export carries args", async () => {
    const ctx = ctxWith(new Map([["Button", { id: "b", importPath: "src/Button.stories.tsx", hasArgTypes: false, stories: [{ name: "Primary", args: { variant: "primary" } }] }]]));
    const res = await rule.evaluate(ctx, EMPTY);
    expect(res.findings).toHaveLength(0);
  });

  it("flags a story with neither argTypes nor any args when component has props", async () => {
    const ctx = ctxWith(new Map([["Button", { id: "b", importPath: "src/Button.stories.tsx", hasArgTypes: false, stories: [{ name: "Primary" }] }]]));
    const res = await rule.evaluate(ctx, EMPTY);
    expect(res.opportunities).toBe(1);
    expect(res.findings.map((f) => f.message).some((m) => m.includes("Button"))).toBe(true);
  });

  it("does not count an inventory component that has no story", async () => {
    const ctx = ctxWith(new Map(), { componentInventory: [{ name: "Ghost", module: "@acme/ui", usageCount: 2, props: [{ name: "size" }] }] });
    const res = await rule.evaluate(ctx, EMPTY);
    expect(res.opportunities).toBe(0);
    expect(res.findings).toHaveLength(0);
  });

  it("returns opportunities 0 + no findings when storyIndex is null", async () => {
    const res = await rule.evaluate(ctxWith(new Map(), { storyIndex: null }), EMPTY);
    expect(res.opportunities).toBe(0);
    expect(res.findings).toHaveLength(0);
  });

  it("fires in dsSelfMode when a DS component has props but its story documents none", async () => {
    const ctx = ctxWith(new Map([["Button", { id: "b", importPath: "x", hasArgTypes: false, stories: [{ name: "Primary" }] }]]), { dsSelfMode: true });
    const res = await rule.evaluate(ctx, EMPTY);
    expect(res.opportunities).toBe(1);
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0]?.message).toContain("Button");
  });

  it("does NOT flag a prop-less component (no props to document)", async () => {
    const ctx = ctxWith(
      new Map([["Divider", { id: "d", importPath: "x", hasArgTypes: false, stories: [{ name: "Default" }] }]]),
      { componentInventory: [{ name: "Divider", module: "@acme/ui", usageCount: 2, props: [] }] },
    );
    const res = await rule.evaluate(ctx, EMPTY);
    expect(res.findings).toHaveLength(0);
  });

  it("flags a component WITH props whose story documents none", async () => {
    const ctx = ctxWith(
      new Map([["Button", { id: "b", importPath: "x", hasArgTypes: false, stories: [{ name: "Primary" }] }]]),
      { componentInventory: [{ name: "Button", module: "@acme/ui", usageCount: 5, props: [{ name: "variant" }] }] },
    );
    const res = await rule.evaluate(ctx, EMPTY);
    expect(res.findings).toHaveLength(1);
  });

  it("does NOT flag when the component's props are unknown (not parsed)", async () => {
    const ctx = ctxWith(
      new Map([["Button", { id: "b", importPath: "x", hasArgTypes: false, stories: [{ name: "Primary" }] }]]),
      { componentInventory: [{ name: "Button", module: "@acme/ui", usageCount: 5 }] },
    );
    const res = await rule.evaluate(ctx, EMPTY);
    expect(res.findings).toHaveLength(0);
  });
});
