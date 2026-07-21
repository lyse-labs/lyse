import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/tokens-no-hardcoded-z-index.js";
import { createResolver } from "../../src/graph/resolve/index.js";
import type { RuleContext, ParsedFiles, TokenMap, ExtractedCssInJsBlock } from "../../src/types.js";
import type { DesignSystemGraph, ZoneKind, TokenNode } from "../../src/graph/types.js";

function makeCtx(repoRoot: string, tokens: TokenMap | null = null): RuleContext {
  return { repoRoot, tokens, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] };
}

function makeParsed(opts: { css?: { path: string; source: string }[]; cssInJs?: ExtractedCssInJsBlock[] } = {}): ParsedFiles {
  return { ts: [], css: opts.css ?? [], cssInJs: opts.cssInJs ?? [] };
}

function tokensWithZIndex(): TokenMap {
  return { zIndex: new Map([["100", ["z.modal"]]]) } as unknown as TokenMap;
}

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "lyse-zindex-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe("rule tokens/no-hardcoded-z-index", () => {
  it("flags a large hardcoded z-index with no token scale", async () => {
    const parsed = makeParsed({ css: [{ path: "src/m.css", source: ".modal { z-index: 9999; }" }] });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.ruleId).toBe("tokens/no-hardcoded-z-index");
    expect(result.findings[0]!.axis).toBe("tokens");
  });

  it("does not flag trivial z-index values (-1, 0, 1)", async () => {
    const parsed = makeParsed({ css: [{ path: "a.css", source: ".a{z-index:0}.b{z-index:1}.c{z-index:-1}" }] });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does not flag a tokenized z-index via var()", async () => {
    const parsed = makeParsed({ css: [{ path: "a.css", source: ".modal { z-index: var(--z-modal); }" }] });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does not flag a value present in the z-index token scale", async () => {
    const parsed = makeParsed({ css: [{ path: "a.css", source: ".modal { z-index: 100; }" }] });
    const result = await rule.evaluate(makeCtx(tmp, tokensWithZIndex()), parsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBeGreaterThanOrEqual(1);
  });

  it("flags a value NOT in the token scale", async () => {
    const parsed = makeParsed({ css: [{ path: "a.css", source: ".x { z-index: 50; }" }] });
    const result = await rule.evaluate(makeCtx(tmp, tokensWithZIndex()), parsed);
    expect(result.findings).toHaveLength(1);
  });

  it("detects z-index inside a CSS-in-JS block", async () => {
    const parsed = makeParsed({ cssInJs: [{ path: "Box.tsx", line: 3, content: "z-index: 200;" }] });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(1);
  });

  it("is allowlisted by a README lyse-disable directive", async () => {
    writeFileSync(join(tmp, "README.md"), "# DS\n\nlyse-disable tokens/no-hardcoded-z-index\n");
    const parsed = makeParsed({ css: [{ path: "a.css", source: ".x { z-index: 9999; }" }] });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });

  it("does not flag a z-index value that lives in a comment", async () => {
    const parsed = makeParsed({ css: [{ path: "a.css", source: "/* z-index: 9999 — old value */\n.x { color: red; }" }] });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });

  describe("_internal.extractZIndexValues", () => {
    it("captures integer z-index values, skipping var() and trivial ones", () => {
      expect(_internal.extractZIndexValues(".a{z-index:9999}").map((h) => h.value)).toEqual([9999]);
      expect(_internal.extractZIndexValues(".a{z-index:0}.b{z-index:1}.c{z-index:-1}")).toEqual([]);
      expect(_internal.extractZIndexValues(".a{z-index:var(--z)}")).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// P2 — graph-aware zone gating (Task 8: z-index migration)
// ---------------------------------------------------------------------------
function graphWith(zones: Record<string, string>, zIndex: string[] = []): DesignSystemGraph {
  return {
    schemaVersion: 1,
    tokens: zIndex.map((v, i) => ({ id: `zIndex.${i}`, axis: "zIndex" as const, rawValue: v, source: "dtcg" as const })),
    components: [], stories: [], usage: [],
    zones: { byFile: zones as Record<string, ZoneKind> },
    extraction: { entries: [], conflicts: [] },
  };
}
function ctxWith(graph: DesignSystemGraph): RuleContext {
  return { repoRoot: "/r", tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [], graph };
}

describe("graph-aware zone gating (P2 migration)", () => {
  it("does NOT flag a hardcoded z-index in a story-zoned file", async () => {
    const files: ParsedFiles = { ts: [], css: [{ path: "a/Story.css", source: ".modal { z-index: 9999; }" }], cssInJs: [] };
    const graph = graphWith({ "a/Story.css": "story" });
    const res = await rule.evaluate(ctxWith(graph), files);
    expect(res.findings).toHaveLength(0);
  });

  it("flags a hardcoded z-index in an app-zoned file", async () => {
    const files: ParsedFiles = { ts: [], css: [{ path: "a/Real.css", source: ".modal { z-index: 9999; }" }], cssInJs: [] };
    const graph = graphWith({ "a/Real.css": "app" });
    const res = await rule.evaluate(ctxWith(graph), files);
    expect(res.findings).toHaveLength(1);
  });

  it("treats a value present in the fused graph tokens as on-scale (no finding)", async () => {
    const files: ParsedFiles = { ts: [], css: [{ path: "a/Real.css", source: ".modal { z-index: 9999; }" }], cssInJs: [] };
    const graph = graphWith({ "a/Real.css": "app" }, ["9999"]);
    const res = await rule.evaluate(ctxWith(graph), files);
    expect(res.findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Task 7 — resolver-driven verdicts (mirrors Task 6's spacing migration)
// ---------------------------------------------------------------------------
async function runRuleWithGraph(source: string, tokens: TokenNode[]) {
  const graph: DesignSystemGraph = {
    schemaVersion: 1,
    tokens,
    components: [],
    stories: [],
    usage: [],
    zones: { byFile: { "a/Real.css": "app" } },
    extraction: { entries: [], conflicts: [] },
  };
  const ctx = {
    repoRoot: "/repo",
    tokens: null,
    componentsModule: null,
    componentInventory: [],
    storyIndex: null,
    excludePaths: [],
    graph,
    resolver: createResolver(graph),
  } as unknown as RuleContext;
  const parsed: ParsedFiles = { ts: [], css: [{ path: "a/Real.css", source }], cssInJs: [] };
  return rule.evaluate(ctx, parsed);
}

describe("derived scales", () => {
  it("does not flag a z-index on the repo's own scale", async () => {
    const res = await runRuleWithGraph(
      ".modal { z-index: 100; }",
      [{ id: "zIndex.modal", axis: "zIndex", rawValue: "100", source: "dtcg" }],
    );
    expect(res.findings).toHaveLength(0);
  });

  it("degrades a far-off z-index to info/low", async () => {
    const res = await runRuleWithGraph(
      ".x { z-index: 5000000; }",
      [{ id: "zIndex.modal", axis: "zIndex", rawValue: "100", source: "dtcg" }],
    );
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0]?.severity).toBe("info");
    expect(res.findings[0]?.confidence).toBe("low");
  });

  it("flags a one-step-off z-index as warning and names its candidate token", async () => {
    const res = await runRuleWithGraph(
      ".x { z-index: 100; }",
      [
        { id: "zIndex.dropdown", axis: "zIndex", rawValue: "10", source: "dtcg" },
        { id: "zIndex.modal", axis: "zIndex", rawValue: "1000", source: "dtcg" },
      ],
    );
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0]?.severity).toBe("warning");
    expect(res.findings[0]?.confidence).toBe("medium");
    expect(res.findings[0]?.suggestion).toBe("probably `zIndex.dropdown` — verify before replacing");
  });

  it("degrades to info on a zero-token graph — no default z-index scale (behaviour change vs. pre-migration warning)", async () => {
    const res = await runRuleWithGraph(".x { z-index: 5000000; }", []);
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0]?.severity).toBe("info");
  });
});
