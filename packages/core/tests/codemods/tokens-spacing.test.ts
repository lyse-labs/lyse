import { describe, it, expect } from "vitest";
import { fixHardcodedSpacing } from "../../src/codemods/tokens-spacing.js";
import type { Finding, RuleContext, TokenMap } from "../../src/types.js";

function makeCtx(spacing: Map<string, string[]>): RuleContext {
  const tokens: TokenMap = {
    colors: new Map(),
    spacing,
    typography: new Map(),
    radii: new Map(),
    shadows: new Map(),
    motion: new Map(),
    breakpoints: new Map(),
    zIndex: new Map(),
    opacity: new Map(),
    borderWidth: new Map(),
    source: "tailwind-v3",
  };
  return {
    repoRoot: "/r",
    tokens,
    componentsModule: null,
    componentInventory: [],
    storyIndex: null,
    excludePaths: [],
  };
}

const finding = (line: number): Finding => ({
  ruleId: "tokens/no-hardcoded-spacing",
  axis: "tokens",
  severity: "warning",
  location: { file: "x.tsx", line, column: 1 },
  message: "x",
});

describe("fixHardcodedSpacing", () => {
  it("produces a diff when reverse-lookup yields exactly one token (px)", () => {
    const source = `const style = { padding: "16px" };`;
    const spacing = new Map([["16", ["4"]]]);
    const r = fixHardcodedSpacing({
      source,
      path: "x.tsx",
      finding: finding(1),
      ctx: makeCtx(spacing),
    });
    expect(r.patch).not.toBeNull();
    expect(r.patch).toContain("--- a/x.tsx");
    expect(r.patch).toContain("--spacing-4");
    expect(r.confidence).toBeGreaterThan(0.9);
    expect(r.rationale).toBeNull();
  });

  it("produces a diff for rem values", () => {
    const source = `const style = { margin: "1rem" };`;
    const spacing = new Map([["1", ["4"]]]);
    const r = fixHardcodedSpacing({
      source,
      path: "x.tsx",
      finding: finding(1),
      ctx: makeCtx(spacing),
    });
    expect(r.patch).not.toBeNull();
    expect(r.patch).toContain("--spacing-4");
  });

  it("returns patch:null + alternatives when multiple candidates", () => {
    const source = `const style = { gap: "8px" };`;
    const spacing = new Map([["8", ["2", "sm"]]]);
    const r = fixHardcodedSpacing({
      source,
      path: "x.tsx",
      finding: finding(1),
      ctx: makeCtx(spacing),
    });
    expect(r.patch).toBeNull();
    expect(r.alternatives).toHaveLength(2);
    expect(r.rationale).toContain("multiple tokens");
  });

  it("returns patch:null + rationale when value not in spacing scale", () => {
    const source = `const style = { padding: "13px" };`;
    const spacing = new Map([["16", ["4"]]]);
    const r = fixHardcodedSpacing({
      source,
      path: "x.tsx",
      finding: finding(1),
      ctx: makeCtx(spacing),
    });
    expect(r.patch).toBeNull();
    expect(r.rationale).toContain("not in the spacing token scale");
  });

  it("returns patch:null when no spacing tokens loaded", () => {
    const source = `const style = { padding: "16px" };`;
    const r = fixHardcodedSpacing({
      source,
      path: "x.tsx",
      finding: finding(1),
      ctx: { ...makeCtx(new Map()), tokens: null },
    });
    expect(r.patch).toBeNull();
    expect(r.rationale).toContain("No spacing tokens loaded");
  });

  it("returns patch:null when no spacing value found on the line", () => {
    const source = `const x = "hello world";`;
    const spacing = new Map([["16", ["4"]]]);
    const r = fixHardcodedSpacing({
      source,
      path: "x.tsx",
      finding: finding(1),
      ctx: makeCtx(spacing),
    });
    expect(r.patch).toBeNull();
    expect(r.rationale).toContain("Could not extract");
  });
});
