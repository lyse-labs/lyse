import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/tokens-no-hardcoded-typography.js";
import { createResolver } from "../../src/graph/resolve/index.js";
import type { RuleContext, ParsedFiles, TokenMap, ExtractedCssInJsBlock } from "../../src/types.js";
import type { DesignSystemGraph, ZoneKind, TokenNode } from "../../src/graph/types.js";

function makeCtx(repoRoot: string, tokens: TokenMap | null = null): RuleContext {
  return { repoRoot, tokens, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] };
}
function makeParsed(opts: { css?: { path: string; source: string }[]; cssInJs?: ExtractedCssInJsBlock[] } = {}): ParsedFiles {
  return { ts: [], css: opts.css ?? [], cssInJs: opts.cssInJs ?? [] };
}
function tokensWithTypography(): TokenMap {
  return {
    typography: new Map([["1rem", ["fontSize.md"]], ["weight/600", ["weight.semibold"]], ["letter-spacing/0.5px", ["ls.wide"]]]),
  } as unknown as TokenMap;
}

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "lyse-typo-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe("rule tokens/no-hardcoded-typography", () => {
  it("flags a hardcoded font-size with no scale", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".t { font-size: 13px; }" }] }));
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.ruleId).toBe("tokens/no-hardcoded-typography");
  });
  it("does not flag font-size percentages or keywords", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".a{font-size:100%}.b{font-size:larger}" }] }));
    expect(r.findings).toHaveLength(0);
  });
  it("flags an off-scale numeric font-weight but not 400/700/keywords", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".a{font-weight:650}.b{font-weight:400}.c{font-weight:700}.d{font-weight:bold}" }] }));
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.message).toContain("650");
  });
  it("flags a hardcoded letter-spacing but not 0", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".a{letter-spacing:0.4px}.b{letter-spacing:0}" }] }));
    expect(r.findings).toHaveLength(1);
  });
  it("does NOT flag line-height (out of scope — too noisy)", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".t { line-height: 1.7; }" }] }));
    expect(r.findings).toHaveLength(0);
  });
  it("does not flag var() references", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".t { font-size: var(--fs); font-weight: var(--fw); }" }] }));
    expect(r.findings).toHaveLength(0);
  });
  it("does not flag values on the typography scale", async () => {
    const css = [{ path: "a.css", source: ".t { font-size: 1rem; font-weight: 600; letter-spacing: 0.5px; }" }];
    const r = await rule.evaluate(makeCtx(tmp, tokensWithTypography()), makeParsed({ css }));
    expect(r.findings).toHaveLength(0);
  });
  it("is allowlisted via README", async () => {
    writeFileSync(join(tmp, "README.md"), "lyse-disable tokens/no-hardcoded-typography\n");
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".t{font-size:13px}" }] }));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("does not flag a typography value that lives in a comment", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: "/* font-size: 13px — legacy */\n.x{color:red}" }] }));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  describe("_internal.extractTypography", () => {
    it("captures size/weight/letter-spacing drift, skipping exemptions + line-height", () => {
      const kinds = _internal
        .extractTypography(".t{font-size:13px;font-weight:650;letter-spacing:0.4px;line-height:1.5}")
        .map((h) => h.prop)
        .sort();
      expect(kinds).toEqual(["font-size", "font-weight", "letter-spacing"]);
    });
  });
});

// ---------------------------------------------------------------------------
// P2 — graph-aware zone gating (Task 6: typography migration)
// ---------------------------------------------------------------------------
function graphWith(zones: Record<string, string>, typography: string[] = []): DesignSystemGraph {
  return {
    schemaVersion: 1,
    tokens: typography.map((v, i) => ({ id: `typography.${i}`, axis: "typography" as const, rawValue: v, source: "dtcg" as const })),
    components: [], stories: [], usage: [],
    zones: { byFile: zones as Record<string, ZoneKind> },
    extraction: { entries: [], conflicts: [] },
  };
}
function ctxWith(graph: DesignSystemGraph): RuleContext {
  return { repoRoot: "/r", tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [], graph };
}

describe("graph-aware zone gating (P2 migration)", () => {
  it("does NOT flag a hardcoded font-size in a story-zoned file", async () => {
    const files: ParsedFiles = { ts: [], css: [{ path: "a/Story.css", source: ".t{font-size:13px}" }], cssInJs: [] };
    const graph = graphWith({ "a/Story.css": "story" });
    const res = await rule.evaluate(ctxWith(graph), files);
    expect(res.findings).toHaveLength(0);
  });

  it("flags a hardcoded font-size in an app-zoned file", async () => {
    const files: ParsedFiles = { ts: [], css: [{ path: "a/Real.css", source: ".t{font-size:13px}" }], cssInJs: [] };
    const graph = graphWith({ "a/Real.css": "app" });
    const res = await rule.evaluate(ctxWith(graph), files);
    expect(res.findings).toHaveLength(1);
  });

  it("treats a value present in the fused graph tokens as on-scale (no finding)", async () => {
    const files: ParsedFiles = { ts: [], css: [{ path: "a/Real.css", source: ".t{font-size:13px}" }], cssInJs: [] };
    const graph = graphWith({ "a/Real.css": "app" }, ["13px"]);
    const res = await rule.evaluate(ctxWith(graph), files);
    expect(res.findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Task 8 — resolver-driven verdicts (mirrors Task 7's z-index/spacing pattern,
// with the composite-axis inversion: `exact` is compliant, `near` never occurs).
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

describe("composite resolution", () => {
  it("does not flag a font-size that exactly matches a token", async () => {
    const res = await runRuleWithGraph(
      ".t { font-size: 13px; }",
      [{ id: "fontSize.sm", axis: "typography", rawValue: "13px", source: "dtcg" }],
    );
    expect(res.findings).toHaveLength(0);
  });

  it("reports a non-matching font-size as a warning and sets no emit-time confidence", async () => {
    const res = await runRuleWithGraph(
      ".t { font-size: 15px; }",
      [{ id: "fontSize.sm", axis: "typography", rawValue: "13px", source: "dtcg" }],
    );
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0]?.severity).toBe("warning");
    expect(res.findings[0]?.confidence).toBeUndefined();
  });

  it("does not flag a font-weight that exactly matches a token", async () => {
    const res = await runRuleWithGraph(
      ".t { font-weight: 600; }",
      [{ id: "weight.semibold", axis: "typography", rawValue: "weight/600", source: "dtcg" }],
    );
    expect(res.findings).toHaveLength(0);
  });

  it("reports a non-matching font-weight as a warning", async () => {
    const res = await runRuleWithGraph(
      ".t { font-weight: 650; }",
      [{ id: "weight.semibold", axis: "typography", rawValue: "weight/600", source: "dtcg" }],
    );
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0]?.severity).toBe("warning");
    expect(res.findings[0]?.confidence).toBeUndefined();
  });

  it("reports one-step-off values as warnings too — `near` is unreachable, so `novel` must carry them", async () => {
    const res = await runRuleWithGraph(
      ".t { font-size: 14px; font-weight: 601; letter-spacing: 0.6px; }",
      [
        { id: "fontSize.sm", axis: "typography", rawValue: "13px", source: "dtcg" },
        { id: "weight.semibold", axis: "typography", rawValue: "weight/600", source: "dtcg" },
        { id: "ls.wide", axis: "typography", rawValue: "letter-spacing/0.5px", source: "dtcg" },
      ],
    );
    expect(res.findings).toHaveLength(3);
    expect(res.findings.every((f) => f.severity === "warning")).toBe(true);
    expect(res.findings.every((f) => f.confidence === undefined)).toBe(true);
  });
});

// Task 9 item 3 — see the identical block in tokens-no-hardcoded-shadow.test.ts.
describe("suggestion parity between the legacy and resolver paths", () => {
  it("emits the same static hint on the resolver path as the legacy path", async () => {
    const res = await runRuleWithGraph(
      ".c { font-size: 13px; }",
      [{ id: "font.md", axis: "typography", rawValue: "16px", source: "dtcg" }],
    );
    expect(res.findings[0]?.suggestion).toBe(
      "reference a typography token (e.g. `--font-size-md`, `--font-weight-semibold`) instead of a raw value",
    );
  });
});
