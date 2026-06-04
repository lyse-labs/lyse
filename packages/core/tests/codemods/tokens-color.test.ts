import { describe, it, expect } from "vitest";
import { fixHardcodedColor } from "../../src/codemods/tokens-color.js";
import type { Finding, RuleContext, TokenMap } from "../../src/types.js";

function makeCtx(colors: Map<string, string[]>): RuleContext {
  const tokens: TokenMap = {
    colors,
    spacing: new Map(),
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
  ruleId: "tokens/no-hardcoded-color",
  axis: "tokens",
  severity: "warning",
  location: { file: "x.tsx", line, column: 1 },
  message: "x",
});

describe("fixHardcodedColor", () => {
  it("produces a single-line diff when reverse-lookup yields exactly one token", () => {
    const source = `import React from "react";\nconst x = "#2563eb";\nexport const y = x;`;
    const colors = new Map([["#2563eb", ["primary"]]]);
    const r = fixHardcodedColor({
      source,
      path: "x.tsx",
      finding: finding(2),
      ctx: makeCtx(colors),
    });
    expect(r.patch).not.toBeNull();
    expect(r.patch).toContain("--- a/x.tsx");
    expect(r.patch).toContain("+++ b/x.tsx");
    expect(r.patch).toContain("--color-primary");
    expect(r.confidence).toBeGreaterThan(0.9);
    expect(r.rationale).toBeNull();
    expect(r.rule_id).toBe("tokens/no-hardcoded-color");
    expect(r.schema_version).toBe("1.0.0");
  });

  it("returns patch:null + alternatives when multiple candidates", () => {
    const source = `const x = "#2563eb";`;
    const colors = new Map([["#2563eb", ["primary", "brand"]]]);
    const r = fixHardcodedColor({
      source,
      path: "x.tsx",
      finding: finding(1),
      ctx: makeCtx(colors),
    });
    expect(r.patch).toBeNull();
    expect(r.alternatives).toHaveLength(2);
    expect(r.rationale).toContain("multiple tokens");
    // Each alternative should have a valid patch
    for (const alt of r.alternatives) {
      expect(alt.patch).toContain("--- a/x.tsx");
    }
  });

  it("returns patch:null + rationale when value not in token map", () => {
    const source = `const x = "#abcdef";`;
    const colors = new Map([["#2563eb", ["primary"]]]);
    const r = fixHardcodedColor({
      source,
      path: "x.tsx",
      finding: finding(1),
      ctx: makeCtx(colors),
    });
    expect(r.patch).toBeNull();
    expect(r.rationale).toContain("not in the project's token map");
  });

  it("returns patch:null when no tokens loaded", () => {
    const source = `const x = "#2563eb";`;
    const r = fixHardcodedColor({
      source,
      path: "x.tsx",
      finding: finding(1),
      ctx: { ...makeCtx(new Map()), tokens: null },
    });
    expect(r.patch).toBeNull();
    expect(r.rationale).toContain("No tokens loaded");
  });

  it("handles rgb() color values", () => {
    const source = `const bg = "rgb(37, 99, 235)";`;
    const colors = new Map([["rgb(37, 99, 235)", ["primary"]]]);
    const r = fixHardcodedColor({
      source,
      path: "x.tsx",
      finding: finding(1),
      ctx: makeCtx(colors),
    });
    expect(r.patch).not.toBeNull();
    expect(r.patch).toContain("--color-primary");
  });

  it("the diff contains old line with minus and new line with plus", () => {
    const source = `const x = "#2563eb";\n`;
    const colors = new Map([["#2563eb", ["primary"]]]);
    const r = fixHardcodedColor({
      source,
      path: "x.tsx",
      finding: finding(1),
      ctx: makeCtx(colors),
    });
    expect(r.patch).not.toBeNull();
    const lines = r.patch!.split("\n");
    const minusLine = lines.find((l) => l.startsWith("-") && l.includes("#2563eb"));
    const plusLine = lines.find((l) => l.startsWith("+") && l.includes("--color-primary"));
    expect(minusLine).toBeDefined();
    expect(plusLine).toBeDefined();
  });
});
