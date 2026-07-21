import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule } from "../../src/rules/tokens-no-hardcoded-border-width.js";
import { createResolver } from "../../src/graph/resolve/index.js";
import type { RuleContext, ParsedFiles, TokenMap, ExtractedCssInJsBlock } from "../../src/types.js";
import type { DesignSystemGraph, ZoneKind, TokenNode } from "../../src/graph/types.js";

function makeCtx(repoRoot: string, tokens: TokenMap | null = null): RuleContext {
  return { repoRoot, tokens, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] };
}
function makeParsed(opts: { css?: { path: string; source: string }[]; cssInJs?: ExtractedCssInJsBlock[] } = {}): ParsedFiles {
  return { ts: [], css: opts.css ?? [], cssInJs: opts.cssInJs ?? [] };
}
function tokensWithBorderWidth(): TokenMap {
  return { borderWidth: new Map([["2px", ["border.thick"]]]) } as unknown as TokenMap;
}

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "lyse-bw-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe("rule tokens/no-hardcoded-border-width", () => {
  it("flags a hardcoded border-width longhand with no scale", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".x { border-width: 3px; }" }] }));
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.ruleId).toBe("tokens/no-hardcoded-border-width");
  });
  it("flags the width inside a `border:` shorthand", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".x { border: 4px solid red; }" }] }));
    expect(r.findings).toHaveLength(1);
  });
  it("does not flag 0 or the 1px hairline", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".a{border-width:0}.b{border:1px solid red}" }] }));
    expect(r.findings).toHaveLength(0);
  });
  it("does not flag var()", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".x{border-width:var(--bw)}" }] }));
    expect(r.findings).toHaveLength(0);
  });
  it("does not flag a value on the borderWidth scale", async () => {
    const r = await rule.evaluate(makeCtx(tmp, tokensWithBorderWidth()), makeParsed({ css: [{ path: "a.css", source: ".x{border-width:2px}" }] }));
    expect(r.findings).toHaveLength(0);
  });
  it("is allowlisted via README", async () => {
    writeFileSync(join(tmp, "README.md"), "lyse-disable tokens/no-hardcoded-border-width\n");
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".x{border-width:3px}" }] }));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });
  it("does not flag a border-width value that lives in a comment", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: "/* border-width: 3px — old */\n.x{color:red}" }] }));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// P2 — graph-aware zone gating (Task 6: border-width migration)
// ---------------------------------------------------------------------------
function graphWith(zones: Record<string, string>, borderWidth: string[] = []): DesignSystemGraph {
  return {
    schemaVersion: 1,
    tokens: borderWidth.map((v, i) => ({ id: `borderWidth.${i}`, axis: "borderWidth" as const, rawValue: v, source: "dtcg" as const })),
    components: [], stories: [], usage: [],
    zones: { byFile: zones as Record<string, ZoneKind> },
    extraction: { entries: [], conflicts: [] },
  };
}
function ctxWith(graph: DesignSystemGraph): RuleContext {
  return { repoRoot: "/r", tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [], graph };
}

describe("graph-aware zone gating (P2 migration)", () => {
  it("does NOT flag a hardcoded border-width in a story-zoned file", async () => {
    const files: ParsedFiles = { ts: [], css: [{ path: "a/Story.css", source: ".x{border-width:3px}" }], cssInJs: [] };
    const graph = graphWith({ "a/Story.css": "story" });
    const res = await rule.evaluate(ctxWith(graph), files);
    expect(res.findings).toHaveLength(0);
  });

  it("flags a hardcoded border-width in an app-zoned file", async () => {
    const files: ParsedFiles = { ts: [], css: [{ path: "a/Real.css", source: ".x{border-width:3px}" }], cssInJs: [] };
    const graph = graphWith({ "a/Real.css": "app" });
    const res = await rule.evaluate(ctxWith(graph), files);
    expect(res.findings).toHaveLength(1);
  });

  it("treats a value present in the fused graph tokens as on-scale (no finding)", async () => {
    const files: ParsedFiles = { ts: [], css: [{ path: "a/Real.css", source: ".x{border-width:3px}" }], cssInJs: [] };
    const graph = graphWith({ "a/Real.css": "app" }, ["3px"]);
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
  it("does not flag a border-width on the repo's own scale", async () => {
    const res = await runRuleWithGraph(
      ".x{border-width:5px}",
      [{ id: "borderWidth.md", axis: "borderWidth", rawValue: "5", source: "dtcg" }],
    );
    expect(res.findings).toHaveLength(0);
  });

  it("degrades a far-off border-width to info/low", async () => {
    const res = await runRuleWithGraph(
      ".x{border-width:413px}",
      [{ id: "borderWidth.md", axis: "borderWidth", rawValue: "5", source: "dtcg" }],
    );
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0]?.severity).toBe("info");
    expect(res.findings[0]?.confidence).toBe("low");
  });

  it("flags a one-step-off border-width as warning and names its candidate token", async () => {
    const res = await runRuleWithGraph(
      ".x{border-width:2px}",
      [
        { id: "borderWidth.thin", axis: "borderWidth", rawValue: "1px", source: "dtcg" },
        { id: "borderWidth.thick", axis: "borderWidth", rawValue: "4px", source: "dtcg" },
      ],
    );
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0]?.severity).toBe("warning");
    expect(res.findings[0]?.confidence).toBe("medium");
    expect(res.findings[0]?.suggestion).toBe("probably `borderWidth.thin` — verify before replacing");
  });

  it("degrades to info on a zero-token graph — no default border-width scale (behaviour change vs. pre-migration warning)", async () => {
    const res = await runRuleWithGraph(".x{border-width:413px}", []);
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0]?.severity).toBe("info");
  });
});

// ---------------------------------------------------------------------------
// Regression — a `novel` verdict must keep the static remediation hint the
// pre-migration rule always emitted (see reporters/terminal.ts:42).
// ---------------------------------------------------------------------------
describe("novel keeps the static suggestion", () => {
  it("emits the border-width hint on a far-off value", async () => {
    const res = await runRuleWithGraph(
      ".x{border-width:413px}",
      [{ id: "borderWidth.md", axis: "borderWidth", rawValue: "5", source: "dtcg" }],
    );
    expect(res.findings[0]?.severity).toBe("info");
    expect(res.findings[0]?.suggestion).toBe(
      "reference a border-width token (e.g. `--border-width-thick`) instead of a raw length",
    );
  });
});
