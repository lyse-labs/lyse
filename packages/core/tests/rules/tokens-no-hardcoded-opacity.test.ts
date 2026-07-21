import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/tokens-no-hardcoded-opacity.js";
import { createResolver } from "../../src/graph/resolve/index.js";
import type { RuleContext, ParsedFiles, TokenMap, ExtractedCssInJsBlock } from "../../src/types.js";
import type { DesignSystemGraph, ZoneKind, TokenNode } from "../../src/graph/types.js";

function makeCtx(repoRoot: string, tokens: TokenMap | null = null): RuleContext {
  return { repoRoot, tokens, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] };
}
function makeParsed(opts: { css?: { path: string; source: string }[]; cssInJs?: ExtractedCssInJsBlock[] } = {}): ParsedFiles {
  return { ts: [], css: opts.css ?? [], cssInJs: opts.cssInJs ?? [] };
}
function tokensWithOpacity(): TokenMap {
  return { opacity: new Map([["0.5", ["opacity.muted"]]]) } as unknown as TokenMap;
}

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "lyse-opacity-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe("rule tokens/no-hardcoded-opacity", () => {
  it("flags a hardcoded fractional opacity with no scale", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".x { opacity: 0.65; }" }] }));
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.ruleId).toBe("tokens/no-hardcoded-opacity");
  });
  it("does not flag 0 or 1", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".a{opacity:0}.b{opacity:1}" }] }));
    expect(r.findings).toHaveLength(0);
  });
  it("does not flag var()", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".x{opacity:var(--o)}" }] }));
    expect(r.findings).toHaveLength(0);
  });
  it("does not flag a value on the opacity scale", async () => {
    const r = await rule.evaluate(makeCtx(tmp, tokensWithOpacity()), makeParsed({ css: [{ path: "a.css", source: ".x{opacity:0.5}" }] }));
    expect(r.findings).toHaveLength(0);
  });
  it("is allowlisted via README", async () => {
    writeFileSync(join(tmp, "README.md"), "lyse-disable tokens/no-hardcoded-opacity\n");
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".x{opacity:0.3}" }] }));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });
  it("does not flag an opacity value that lives in a comment", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: "/* opacity: 0.65 — deprecated */\n.x{color:red}" }] }));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// P2 — graph-aware zone gating (Task 7: opacity migration)
// ---------------------------------------------------------------------------
function graphWith(zones: Record<string, string>, opacity: string[] = []): DesignSystemGraph {
  return {
    schemaVersion: 1,
    tokens: opacity.map((v, i) => ({ id: `opacity.${i}`, axis: "opacity" as const, rawValue: v, source: "dtcg" as const })),
    components: [], stories: [], usage: [],
    zones: { byFile: zones as Record<string, ZoneKind> },
    extraction: { entries: [], conflicts: [] },
  };
}
function ctxWith(graph: DesignSystemGraph): RuleContext {
  return { repoRoot: "/r", tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [], graph };
}

describe("graph-aware zone gating (P2 migration)", () => {
  it("does NOT flag a hardcoded opacity in a story-zoned file", async () => {
    const files: ParsedFiles = { ts: [], css: [{ path: "a/Story.css", source: ".x { opacity: 0.65; }" }], cssInJs: [] };
    const graph = graphWith({ "a/Story.css": "story" });
    const res = await rule.evaluate(ctxWith(graph), files);
    expect(res.findings).toHaveLength(0);
  });

  it("flags a hardcoded opacity in an app-zoned file", async () => {
    const files: ParsedFiles = { ts: [], css: [{ path: "a/Real.css", source: ".x { opacity: 0.65; }" }], cssInJs: [] };
    const graph = graphWith({ "a/Real.css": "app" });
    const res = await rule.evaluate(ctxWith(graph), files);
    expect(res.findings).toHaveLength(1);
  });

  it("treats a value present in the fused graph tokens as on-scale (no finding)", async () => {
    const files: ParsedFiles = { ts: [], css: [{ path: "a/Real.css", source: ".x { opacity: 0.65; }" }], cssInJs: [] };
    const graph = graphWith({ "a/Real.css": "app" }, ["0.65"]);
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
  it("does not flag an opacity on the repo's own scale", async () => {
    const res = await runRuleWithGraph(
      ".x { opacity: 0.3; }",
      [{ id: "opacity.md", axis: "opacity", rawValue: "0.3", source: "dtcg" }],
    );
    expect(res.findings).toHaveLength(0);
  });

  it("degrades a far-off opacity to info/low", async () => {
    const res = await runRuleWithGraph(
      ".x { opacity: 0.99; }",
      [{ id: "opacity.md", axis: "opacity", rawValue: "0.3", source: "dtcg" }],
    );
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0]?.severity).toBe("info");
    expect(res.findings[0]?.confidence).toBe("low");
  });

  it("flags a one-step-off opacity as warning and names its candidate token", async () => {
    const res = await runRuleWithGraph(
      ".x { opacity: 0.3; }",
      [
        { id: "opacity.sm", axis: "opacity", rawValue: "0.2", source: "dtcg" },
        { id: "opacity.lg", axis: "opacity", rawValue: "0.8", source: "dtcg" },
      ],
    );
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0]?.severity).toBe("warning");
    expect(res.findings[0]?.confidence).toBe("medium");
    expect(res.findings[0]?.suggestion).toBe("probably `opacity.sm` — verify before replacing");
  });

  it("normalises a percent literal to the same fraction as its decimal spelling", async () => {
    const tokens: TokenNode[] = [
      { id: "opacity.sm", axis: "opacity", rawValue: "0.2", source: "dtcg" },
      { id: "opacity.lg", axis: "opacity", rawValue: "0.8", source: "dtcg" },
    ];
    const decimal = await runRuleWithGraph(".x { opacity: 0.3; }", tokens);
    const percent = await runRuleWithGraph(".x { opacity: 30%; }", tokens);
    expect(percent.findings[0]?.severity).toBe(decimal.findings[0]?.severity);
    expect(percent.findings[0]?.suggestion).toBe(decimal.findings[0]?.suggestion);
  });

  it("degrades to info on a zero-token graph — no default opacity scale (behaviour change vs. pre-migration warning)", async () => {
    const res = await runRuleWithGraph(".x { opacity: 0.99; }", []);
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0]?.severity).toBe("info");
  });
});
