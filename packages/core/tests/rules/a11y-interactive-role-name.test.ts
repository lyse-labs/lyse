import { describe, it, expect } from "vitest";
import { rule } from "../../src/rules/a11y-interactive-role-name.js";
import type { RuleContext, ParsedFiles } from "../../src/types.js";

const ctx: RuleContext = {
  repoRoot: "/r", tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [],
};

describe("rule a11y/interactive-role-name", () => {
  it("flags an icon-only button with no accessible name", async () => {
    const parsed: ParsedFiles = {
      ts: [{ path: "A.tsx", source: "export const A = () => <button><svg/></button>;", imports: [], ast: null }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("does NOT flag a button with an aria-label", async () => {
    const parsed: ParsedFiles = {
      ts: [{ path: "A.tsx", source: 'export const A = () => <button aria-label="Close"><svg/></button>;', imports: [], ast: null }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag a button with text content", async () => {
    const parsed: ParsedFiles = {
      ts: [{ path: "A.tsx", source: "export const A = () => <button>Save</button>;", imports: [], ast: null }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does not double-count files where SWC failed (f.ast === null) as parseErrors", async () => {
    const parsed: ParsedFiles = {
      ts: [{ path: "broken.tsx", source: "this is { not valid", imports: [], ast: null }],
      css: [], cssInJs: [],
    };
    const result = await rule.evaluate(ctx, parsed);
    expect(result.parseErrors).toBeUndefined();
    expect(result.findings.length).toBe(0);
  });
});
