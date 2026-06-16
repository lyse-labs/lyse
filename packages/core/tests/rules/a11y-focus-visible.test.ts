import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/a11y-focus-visible.js";
import type { RuleContext, ParsedFiles, ParsedTsFile, ExtractedCssInJsBlock } from "../../src/types.js";

function makeCtx(repoRoot: string): RuleContext {
  return {
    repoRoot,
    tokens: null,
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

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "lyse-focus-visible-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("rule a11y/focus-visible", () => {
  it("flags CSS that removes the focus outline with no :focus-visible adoption", async () => {
    const parsed = makeParsed({
      css: [{ path: "src/reset.css", source: "button:focus { outline: none; }" }],
    });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.ruleId).toBe("a11y/focus-visible");
    expect(result.findings[0]!.axis).toBe("a11y");
    expect(result.opportunities).toBe(1);
  });

  it("does not flag when :focus-visible is used (modern pattern)", async () => {
    const parsed = makeParsed({
      css: [
        { path: "src/reset.css", source: "button:focus:not(:focus-visible) { outline: none; }" },
        { path: "src/focus.css", source: "button:focus-visible { outline: 2px solid blue; }" },
      ],
    });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(1);
  });

  it("is N/A when no outline suppression is present", async () => {
    const parsed = makeParsed({ css: [{ path: "src/x.css", source: ".x { color: red; }" }] });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });

  it("matches the `outline: 0` variant", async () => {
    const parsed = makeParsed({ css: [{ path: "a.css", source: "a:focus { outline: 0; }" }] });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(1);
  });

  it("detects suppression inside a CSS-in-JS block", async () => {
    const parsed = makeParsed({
      cssInJs: [{ path: "Box.tsx", line: 2, content: "&:focus { outline: none; }" }],
    });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(1);
  });

  it("accepts the focus-visible polyfill imported in TS as the guard", async () => {
    const parsed = makeParsed({
      css: [{ path: "src/reset.css", source: "button:focus { outline: none; }" }],
      ts: [{ path: "src/main.ts", source: "import 'focus-visible';" }],
    });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("is allowlisted by a README lyse-disable directive", async () => {
    writeFileSync(join(tmp, "README.md"), "# DS\n\nlyse-disable a11y/focus-visible\n");
    const parsed = makeParsed({
      css: [{ path: "src/reset.css", source: "button:focus { outline: none; }" }],
    });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });

  describe("_internal.suppressesOutline", () => {
    it("true for outline:none / outline:0, false otherwise", () => {
      expect(_internal.suppressesOutline("a:focus { outline: none; }")).toBe(true);
      expect(_internal.suppressesOutline("a:focus { outline: 0; }")).toBe(true);
      expect(_internal.suppressesOutline("a:focus { outline: 2px solid; }")).toBe(false);
      expect(_internal.suppressesOutline(".x { color: red; }")).toBe(false);
    });
  });
});
