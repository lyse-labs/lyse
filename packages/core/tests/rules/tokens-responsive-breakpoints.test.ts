import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/tokens-responsive-breakpoints.js";
import type { RuleContext, ParsedFiles, ParsedTsFile, TokenMap, ExtractedCssInJsBlock } from "../../src/types.js";

function makeCtx(repoRoot: string, tokens: TokenMap | null = null): RuleContext {
  return {
    repoRoot,
    tokens,
    componentsModule: null,
    componentInventory: [],
    storyIndex: null,
    excludePaths: [],
  };
}

function makeParsed(opts: {
  css?: { path: string; source: string }[];
  ts?: { path: string; source: string }[];
  cssInJs?: ExtractedCssInJsBlock[];
} = {}): ParsedFiles {
  const ts: ParsedTsFile[] = (opts.ts ?? []).map((f) => ({ path: f.path, ast: null, source: f.source, imports: [] }));
  return { ts, css: opts.css ?? [], cssInJs: opts.cssInJs ?? [] };
}

function tokensWithBreakpoints(): TokenMap {
  return { breakpoints: new Map([["768px", ["bp.md"]]]) } as unknown as TokenMap;
}

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "lyse-responsive-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("rule tokens/responsive-breakpoints", () => {
  it("flags media queries when no tokenized breakpoint scale exists", async () => {
    const parsed = makeParsed({
      css: [{ path: "src/layout.css", source: "@media (max-width: 600px) { .x { display: none; } }" }],
    });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.ruleId).toBe("tokens/responsive-breakpoints");
    expect(result.findings[0]!.axis).toBe("tokens");
    expect(result.opportunities).toBe(1);
  });

  it("does not flag when breakpoint tokens are defined (ctx.tokens)", async () => {
    const parsed = makeParsed({
      css: [{ path: "src/layout.css", source: "@media (max-width: 768px) { .x {} }" }],
    });
    const result = await rule.evaluate(makeCtx(tmp, tokensWithBreakpoints()), parsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(1);
  });

  it("does not flag when SCSS breakpoint variables are present", async () => {
    const parsed = makeParsed({
      css: [
        { path: "src/_bp.scss", source: "$breakpoint-md: 768px;" },
        { path: "src/layout.scss", source: "@media (min-width: $breakpoint-md) { .x {} }" },
      ],
    });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does not flag when a JS breakpoints theme object is present", async () => {
    const parsed = makeParsed({
      css: [{ path: "src/layout.css", source: "@media (min-width: 768px) { .x {} }" }],
      ts: [{ path: "src/theme.ts", source: "export const breakpoints = { md: '768px' };" }],
    });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("is N/A when there are no width media queries at all", async () => {
    const parsed = makeParsed({ css: [{ path: "src/x.css", source: ".x { color: red; }" }] });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });

  it("detects a media query inside a CSS-in-JS block", async () => {
    const parsed = makeParsed({
      cssInJs: [{ path: "Box.tsx", line: 4, content: "@media (max-width: 480px) { display: none; }" }],
    });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(1);
  });

  it("is allowlisted by a README lyse-disable directive", async () => {
    writeFileSync(join(tmp, "README.md"), "# DS\n\nlyse-disable tokens/responsive-breakpoints\n");
    const parsed = makeParsed({
      css: [{ path: "src/layout.css", source: "@media (max-width: 600px) { .x {} }" }],
    });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });

  describe("_internal.usesWidthMediaQuery", () => {
    it("true for width media queries, false otherwise", () => {
      expect(_internal.usesWidthMediaQuery("@media (max-width: 600px) {}")).toBe(true);
      expect(_internal.usesWidthMediaQuery("@media screen and (min-width: 48em) {}")).toBe(true);
      expect(_internal.usesWidthMediaQuery("@media (prefers-reduced-motion: reduce) {}")).toBe(false);
      expect(_internal.usesWidthMediaQuery(".x { color: red; }")).toBe(false);
    });
  });
});
