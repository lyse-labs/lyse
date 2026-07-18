import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/tokens-no-hardcoded-media-query.js";
import type { RuleContext, ParsedFiles, TokenMap, ExtractedCssInJsBlock } from "../../src/types.js";
import type { DesignSystemGraph, ZoneKind } from "../../src/graph/types.js";

function makeCtx(repoRoot: string, tokens: TokenMap | null = null): RuleContext {
  return { repoRoot, tokens, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] };
}
function makeParsed(opts: { css?: { path: string; source: string }[]; cssInJs?: ExtractedCssInJsBlock[] } = {}): ParsedFiles {
  return { ts: [], css: opts.css ?? [], cssInJs: opts.cssInJs ?? [] };
}
function tokensWithBreakpoints(): TokenMap {
  return { breakpoints: new Map([["768px", ["bp.md"]]]) } as unknown as TokenMap;
}

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "lyse-mq-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe("rule tokens/no-hardcoded-media-query", () => {
  it("flags a hardcoded px breakpoint in a min-width media query", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: "@media (min-width: 768px) { .g { display: grid; } }" }] }));
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.ruleId).toBe("tokens/no-hardcoded-media-query");
    expect(r.findings[0]!.message).toContain("768px");
  });

  it("flags max-width too", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: "@media (max-width: 599px) { .g { display: block; } }" }] }));
    expect(r.findings).toHaveLength(1);
  });

  it("flags em breakpoints", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: "@media (min-width: 48em) { .g { color: red; } }" }] }));
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.message).toContain("48em");
  });

  it("flags range-syntax media features", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: "@media (width >= 600px) { .g { color: red; } }" }] }));
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.message).toContain("600px");
  });

  it("flags two literals in a compound media query", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: "@media (min-width: 768px) and (max-width: 1024px) { .g { color: red; } }" }] }));
    expect(r.findings).toHaveLength(2);
  });

  it("does not flag min-width: 0", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: "@media (min-width: 0) { .g { color: red; } }" }] }));
    expect(r.findings).toHaveLength(0);
  });

  it("does not flag a value that is on the breakpoint scale", async () => {
    const r = await rule.evaluate(makeCtx(tmp, tokensWithBreakpoints()), makeParsed({ css: [{ path: "a.css", source: "@media (min-width: 768px) { .g { color: red; } }" }] }));
    expect(r.findings).toHaveLength(0);
  });

  it("does not flag a SCSS variable breakpoint (tokenized — no raw literal)", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.scss", source: "@media (min-width: $breakpoint-md) { .g { color: red; } }" }] }));
    expect(r.findings).toHaveLength(0);
  });

  it("does not flag a max-width sizing property outside a media query", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".box { max-width: 768px; padding: 13px; }" }] }));
    expect(r.findings).toHaveLength(0);
  });

  it("does not flag a media query value inside a comment", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: "/* @media (min-width: 768px) was here */\n.x { color: red; }" }] }));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("reports N/A (zero opportunities) when there are no media queries", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".x { color: red; }" }] }));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("counts a tokenized media query as a compliant opportunity (N/A is not zero when responsive)", async () => {
    const r = await rule.evaluate(makeCtx(tmp, tokensWithBreakpoints()), makeParsed({ css: [{ path: "a.css", source: "@media (min-width: 768px) { .g { color: red; } }" }] }));
    expect(r.opportunities).toBeGreaterThan(0);
  });

  it("flags hardcoded breakpoints in CSS-in-JS blocks", async () => {
    const block: ExtractedCssInJsBlock = { path: "Comp.tsx", line: 5, content: "@media (min-width: 900px) { color: red; }" };
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ cssInJs: [block] }));
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.location.line).toBe(5);
  });

  it("does not flag low-signal files (tests/stories/fixtures)", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "fixtures/responsive.css", source: "@media (min-width: 768px) { .g { color: red; } }" }] }));
    expect(r.findings).toHaveLength(0);
  });

  it("is allowlisted via README", async () => {
    writeFileSync(join(tmp, "README.md"), "lyse-disable tokens/no-hardcoded-media-query\n");
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: "@media (min-width: 333px) { .g { color: red; } }" }] }));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("exposes internals for testing", () => {
    expect(typeof _internal.isAllowlisted).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// P2 — graph-aware zone gating (Task 8: media-query migration)
// ---------------------------------------------------------------------------
function graphWith(zones: Record<string, string>, breakpoints: string[] = []): DesignSystemGraph {
  return {
    schemaVersion: 1,
    tokens: breakpoints.map((v, i) => ({ id: `breakpoints.${i}`, axis: "breakpoints" as const, rawValue: v, source: "dtcg" as const })),
    components: [], stories: [], usage: [],
    zones: { byFile: zones as Record<string, ZoneKind> },
    extraction: { entries: [], conflicts: [] },
  };
}
function ctxWith(graph: DesignSystemGraph): RuleContext {
  return { repoRoot: "/r", tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [], graph };
}

describe("graph-aware zone gating (P2 migration)", () => {
  it("does NOT flag a hardcoded breakpoint in a story-zoned file", async () => {
    const files: ParsedFiles = { ts: [], css: [{ path: "a/Story.css", source: "@media (min-width: 768px) { .g { color: red; } }" }], cssInJs: [] };
    const graph = graphWith({ "a/Story.css": "story" });
    const res = await rule.evaluate(ctxWith(graph), files);
    expect(res.findings).toHaveLength(0);
  });

  it("flags a hardcoded breakpoint in an app-zoned file", async () => {
    const files: ParsedFiles = { ts: [], css: [{ path: "a/Real.css", source: "@media (min-width: 768px) { .g { color: red; } }" }], cssInJs: [] };
    const graph = graphWith({ "a/Real.css": "app" });
    const res = await rule.evaluate(ctxWith(graph), files);
    expect(res.findings).toHaveLength(1);
  });

  it("treats a breakpoint present in the fused graph tokens as on-scale (no finding)", async () => {
    const files: ParsedFiles = { ts: [], css: [{ path: "a/Real.css", source: "@media (min-width: 768px) { .g { color: red; } }" }], cssInJs: [] };
    const graph = graphWith({ "a/Real.css": "app" }, ["768px"]);
    const res = await rule.evaluate(ctxWith(graph), files);
    expect(res.findings).toHaveLength(0);
  });
});
