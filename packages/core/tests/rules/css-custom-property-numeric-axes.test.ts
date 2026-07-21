import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildGraphForRoot } from "../../src/graph/build-io.js";
import { createResolver } from "../../src/graph/resolve/index.js";
import { deriveScale } from "../../src/graph/resolve/scales.js";
import { rule as radiusRule } from "../../src/rules/tokens-no-hardcoded-border-radius.js";
import { rule as borderWidthRule } from "../../src/rules/tokens-no-hardcoded-border-width.js";
import { rule as opacityRule } from "../../src/rules/tokens-no-hardcoded-opacity.js";
import { rule as zIndexRule } from "../../src/rules/tokens-no-hardcoded-z-index.js";
import { rule as mediaQueryRule } from "../../src/rules/tokens-no-hardcoded-media-query.js";
import type { LyseRule } from "../../src/rules/_rule-module.js";
import type { RuleContext, ParsedFiles } from "../../src/types.js";
import type { DesignSystemGraph } from "../../src/graph/types.js";

// A repo whose ENTIRE token scale is plain `:root {}` custom properties — the
// most common shape in the wild, and the one that used to collapse every
// numeric axis onto `spacing`.
const TOKENS_CSS = `:root {
  --color-brand: #3b82f6;
  --radius-sm: 4px;
  --radius-md: 8px;
  --z-modal: 100;
  --z-dropdown: 50;
  --opacity-disabled: 0.5;
  --border-width-thin: 1px;
  --border-width-thick: 2px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 1024px;
  --space-md: 16px;
}
`;

let graph: DesignSystemGraph;
let root: string;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "lyse-cssvar-axes-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "fx", version: "1.0.0" }));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src/tokens.css"), TOKENS_CSS);
  graph = await buildGraphForRoot(root);
});

function run(r: LyseRule, source: string) {
  const ctx = {
    repoRoot: root,
    tokens: null,
    componentsModule: null,
    componentInventory: [],
    storyIndex: null,
    excludePaths: [],
    graph,
    resolver: createResolver(graph),
  } as unknown as RuleContext;
  const parsed: ParsedFiles = { ts: [], css: [{ path: "src/app.css", source }], cssInJs: [] };
  return r.evaluate(ctx, parsed);
}

describe("plain :root custom properties feed the resolver on every numeric axis", () => {
  it("derives a spacing scale from spacing tokens ONLY (no radii/breakpoints pollution)", () => {
    expect(deriveScale(graph, "spacing")).toEqual([16]);
    expect(deriveScale(graph, "radii")).toEqual([4, 8]);
    expect(deriveScale(graph, "borderWidth")).toEqual([1, 2]);
    expect(deriveScale(graph, "zIndex")).toEqual([50, 100]);
    expect(deriveScale(graph, "opacity")).toEqual([0.5]);
    expect(deriveScale(graph, "breakpoints")).toEqual([768, 1024]);
  });

  const exactCases: Array<[string, LyseRule, string]> = [
    ["border-radius", radiusRule, ".x{border-radius:8px}"],
    ["border-width", borderWidthRule, ".x{border-width:2px}"],
    ["opacity", opacityRule, ".x{opacity:0.5}"],
    ["z-index", zIndexRule, ".x{z-index:100}"],
    ["media-query", mediaQueryRule, "@media (min-width: 768px) { .x{color:red} }"],
  ];

  for (const [name, r, source] of exactCases) {
    it(`${name}: exact match on a declared custom-property token is silent`, async () => {
      const res = await run(r, source);
      expect(res.findings).toEqual([]);
    });
  }

  const nearCases: Array<[string, LyseRule, string, string]> = [
    ["border-radius", radiusRule, ".x{border-radius:7px}", "radius/md"],
    ["border-width", borderWidthRule, ".x{border-width:3px}", "border/width/thick"],
    ["z-index", zIndexRule, ".x{z-index:150}", "z/modal"],
    ["media-query", mediaQueryRule, "@media (min-width: 800px) { .x{color:red} }", "breakpoint/md"],
  ];

  for (const [name, r, source, candidate] of nearCases) {
    it(`${name}: one step off resolves \`near\` and names a correctly-axised token`, async () => {
      const res = await run(r, source);
      expect(res.findings).toHaveLength(1);
      expect(res.findings[0]?.severity).toBe("warning");
      expect(res.findings[0]?.suggestion).toContain(candidate);
    });
  }

  it("spacing: an off-scale literal is no longer suggested a radius token", async () => {
    const { rule: spacingRule } = await import("../../src/rules/tokens-no-hardcoded-spacing.js");
    const res = await run(spacingRule, ".x{padding:20px}");
    for (const f of res.findings) {
      expect(f.suggestion ?? "").not.toContain("radius/");
      expect(f.suggestion ?? "").not.toContain("breakpoint/");
      expect(f.suggestion ?? "").not.toContain("border/width/");
    }
  });
});
