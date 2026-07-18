import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/tokens-no-hardcoded-shadow.js";
import type { RuleContext, ParsedFiles, TokenMap, ExtractedCssInJsBlock } from "../../src/types.js";
import type { DesignSystemGraph, ZoneKind } from "../../src/graph/types.js";

function makeCtx(repoRoot: string, tokens: TokenMap | null = null): RuleContext {
  return { repoRoot, tokens, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] };
}
function makeParsed(opts: { css?: { path: string; source: string }[]; cssInJs?: ExtractedCssInJsBlock[] } = {}): ParsedFiles {
  return { ts: [], css: opts.css ?? [], cssInJs: opts.cssInJs ?? [] };
}
function tokensWithShadow(): TokenMap {
  return { shadows: new Map([["0 1px 3px rgba(0, 0, 0, 0.1)", ["shadow.sm"]]]) } as unknown as TokenMap;
}

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "lyse-shadow-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe("rule tokens/no-hardcoded-shadow", () => {
  it("flags a hardcoded box-shadow with no scale", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".c { box-shadow: 0 2px 8px rgba(0,0,0,0.2); }" }] }));
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.ruleId).toBe("tokens/no-hardcoded-shadow");
  });
  it("does not flag none / inherit", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".a{box-shadow:none}.b{box-shadow:inherit}" }] }));
    expect(r.findings).toHaveLength(0);
  });
  it("does not flag a var() reference", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".c { box-shadow: var(--shadow-sm); }" }] }));
    expect(r.findings).toHaveLength(0);
  });
  it("does not flag a value on the shadow scale (whitespace-insensitive)", async () => {
    const r = await rule.evaluate(makeCtx(tmp, tokensWithShadow()), makeParsed({ css: [{ path: "a.css", source: ".c { box-shadow: 0 1px 3px rgba(0,0,0,0.1); }" }] }));
    expect(r.findings).toHaveLength(0);
  });
  it("detects a box-shadow in a CSS-in-JS block", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ cssInJs: [{ path: "Box.tsx", line: 2, content: "box-shadow: 0 4px 6px rgba(0,0,0,0.3);" }] }));
    expect(r.findings).toHaveLength(1);
  });
  it("is allowlisted via README", async () => {
    writeFileSync(join(tmp, "README.md"), "lyse-disable tokens/no-hardcoded-shadow\n");
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".c{box-shadow:0 2px 8px #000}" }] }));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("does not flag a box-shadow value that lives in a comment", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: "/* box-shadow: 0 2px 4px rgba(0,0,0,0.3) — old */\n.x{color:red}" }] }));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  describe("_internal.extractShadows", () => {
    it("captures literal box-shadow values, skipping none/var", () => {
      expect(_internal.extractShadows(".c{box-shadow:0 2px 8px #000}").map((h) => h.raw.trim())).toEqual(["0 2px 8px #000"]);
      expect(_internal.extractShadows(".a{box-shadow:none}.b{box-shadow:var(--s)}")).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// P2 — graph-aware zone gating (Task 7: shadow migration)
// ---------------------------------------------------------------------------
function graphWith(zones: Record<string, string>, shadows: string[] = []): DesignSystemGraph {
  return {
    schemaVersion: 1,
    tokens: shadows.map((v, i) => ({ id: `shadows.${i}`, axis: "shadows" as const, rawValue: v, source: "dtcg" as const })),
    components: [], stories: [], usage: [],
    zones: { byFile: zones as Record<string, ZoneKind> },
    extraction: { entries: [], conflicts: [] },
  };
}
function ctxWith(graph: DesignSystemGraph): RuleContext {
  return { repoRoot: "/r", tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [], graph };
}

describe("graph-aware zone gating (P2 migration)", () => {
  it("does NOT flag a hardcoded box-shadow in a story-zoned file", async () => {
    const files: ParsedFiles = { ts: [], css: [{ path: "a/Story.css", source: ".c { box-shadow: 0 2px 8px rgba(0,0,0,0.2); }" }], cssInJs: [] };
    const graph = graphWith({ "a/Story.css": "story" });
    const res = await rule.evaluate(ctxWith(graph), files);
    expect(res.findings).toHaveLength(0);
  });

  it("flags a hardcoded box-shadow in an app-zoned file", async () => {
    const files: ParsedFiles = { ts: [], css: [{ path: "a/Real.css", source: ".c { box-shadow: 0 2px 8px rgba(0,0,0,0.2); }" }], cssInJs: [] };
    const graph = graphWith({ "a/Real.css": "app" });
    const res = await rule.evaluate(ctxWith(graph), files);
    expect(res.findings).toHaveLength(1);
  });

  it("treats a value present in the fused graph tokens as on-scale (no finding)", async () => {
    const files: ParsedFiles = { ts: [], css: [{ path: "a/Real.css", source: ".c { box-shadow: 0 2px 8px rgba(0,0,0,0.2); }" }], cssInJs: [] };
    // Graph token nodes carry the rule's normalized (whitespace-stripped, lowercased) key form.
    const graph = graphWith({ "a/Real.css": "app" }, ["02px8pxrgba(0,0,0,0.2)"]);
    const res = await rule.evaluate(ctxWith(graph), files);
    expect(res.findings).toHaveLength(0);
  });
});
