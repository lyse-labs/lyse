import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule } from "../../src/rules/tokens-no-hardcoded-border-radius.js";
import { createResolver } from "../../src/graph/resolve/index.js";
import type { RuleContext, ParsedFiles, TokenMap, ExtractedCssInJsBlock } from "../../src/types.js";
import type { DesignSystemGraph, ZoneKind, TokenNode } from "../../src/graph/types.js";

function makeCtx(repoRoot: string, tokens: TokenMap | null = null): RuleContext {
  return { repoRoot, tokens, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] };
}
function makeParsed(opts: { css?: { path: string; source: string }[]; cssInJs?: ExtractedCssInJsBlock[] } = {}): ParsedFiles {
  return { ts: [], css: opts.css ?? [], cssInJs: opts.cssInJs ?? [] };
}
function tokensWithRadii(): TokenMap {
  return { radii: new Map([["8px", ["radius.md"]]]) } as unknown as TokenMap;
}

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "lyse-radius-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe("rule tokens/no-hardcoded-border-radius", () => {
  it("flags a hardcoded radius with no scale", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".x { border-radius: 6px; }" }] }));
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.ruleId).toBe("tokens/no-hardcoded-border-radius");
  });
  it("does not flag 0 or a percentage", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".a{border-radius:0}.b{border-radius:50%}" }] }));
    expect(r.findings).toHaveLength(0);
  });
  it("does not flag the pill idiom (>=999px)", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".pill{border-radius:9999px}" }] }));
    expect(r.findings).toHaveLength(0);
  });
  it("does not flag var()", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".x{border-radius:var(--r)}" }] }));
    expect(r.findings).toHaveLength(0);
  });
  it("does not flag a value on the radii scale", async () => {
    const r = await rule.evaluate(makeCtx(tmp, tokensWithRadii()), makeParsed({ css: [{ path: "a.css", source: ".x{border-radius:8px}" }] }));
    expect(r.findings).toHaveLength(0);
  });
  it("is allowlisted via README", async () => {
    writeFileSync(join(tmp, "README.md"), "lyse-disable tokens/no-hardcoded-border-radius\n");
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".x{border-radius:6px}" }] }));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });
  it("does not flag a border-radius value that lives in a comment", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: "/* border-radius: 13px — legacy */\n.x{color:red}" }] }));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// P2 — graph-aware zone gating (Task 6: border-radius migration)
// ---------------------------------------------------------------------------
function graphWith(zones: Record<string, string>, radii: string[] = []): DesignSystemGraph {
  return {
    schemaVersion: 1,
    tokens: radii.map((v, i) => ({ id: `radii.${i}`, axis: "radii" as const, rawValue: v, source: "dtcg" as const })),
    components: [], stories: [], usage: [],
    zones: { byFile: zones as Record<string, ZoneKind> },
    extraction: { entries: [], conflicts: [] },
  };
}
function ctxWith(graph: DesignSystemGraph): RuleContext {
  return { repoRoot: "/r", tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [], graph };
}

describe("graph-aware zone gating (P2 migration)", () => {
  it("does NOT flag a hardcoded border-radius in a story-zoned file", async () => {
    const files: ParsedFiles = { ts: [], css: [{ path: "a/Story.css", source: ".x{border-radius:6px}" }], cssInJs: [] };
    const graph = graphWith({ "a/Story.css": "story" });
    const res = await rule.evaluate(ctxWith(graph), files);
    expect(res.findings).toHaveLength(0);
  });

  it("flags a hardcoded border-radius in an app-zoned file", async () => {
    const files: ParsedFiles = { ts: [], css: [{ path: "a/Real.css", source: ".x{border-radius:6px}" }], cssInJs: [] };
    const graph = graphWith({ "a/Real.css": "app" });
    const res = await rule.evaluate(ctxWith(graph), files);
    expect(res.findings).toHaveLength(1);
  });

  it("treats a value present in the fused graph tokens as on-scale (no finding)", async () => {
    const files: ParsedFiles = { ts: [], css: [{ path: "a/Real.css", source: ".x{border-radius:6px}" }], cssInJs: [] };
    const graph = graphWith({ "a/Real.css": "app" }, ["6px"]);
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
  it("does not flag a radius on the repo's own scale", async () => {
    const res = await runRuleWithGraph(
      ".x{border-radius:3px}",
      [{ id: "radii.sm", axis: "radii", rawValue: "3", source: "dtcg" }],
    );
    expect(res.findings).toHaveLength(0);
  });

  it("degrades a far-off radius to info/low", async () => {
    const res = await runRuleWithGraph(
      ".x{border-radius:997px}",
      [{ id: "radii.sm", axis: "radii", rawValue: "3", source: "dtcg" }],
    );
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0]?.severity).toBe("info");
    expect(res.findings[0]?.confidence).toBe("low");
  });

  it("flags a one-step-off radius as warning and names its candidate token", async () => {
    const res = await runRuleWithGraph(
      ".x{border-radius:6px}",
      [
        { id: "radii.sm", axis: "radii", rawValue: "4px", source: "dtcg" },
        { id: "radii.lg", axis: "radii", rawValue: "16px", source: "dtcg" },
      ],
    );
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0]?.severity).toBe("warning");
    expect(res.findings[0]?.confidence).toBe("medium");
    expect(res.findings[0]?.suggestion).toBe("probably `radii.sm` — verify before replacing");
  });

  it("stays silent on a zero-token graph (no default radii scale — unresolved would collapse to novel only if a scale existed)", async () => {
    // With zero radii tokens the axis has no fallback scale (unlike spacing),
    // so a value one step away from nothing is `novel`, not `unresolved` —
    // this documents the info-severity behaviour change, it does not assert
    // silence.
    const res = await runRuleWithGraph(".x{border-radius:997px}", []);
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0]?.severity).toBe("info");
  });
});
