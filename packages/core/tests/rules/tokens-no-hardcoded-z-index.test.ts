import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/tokens-no-hardcoded-z-index.js";
import type { RuleContext, ParsedFiles, TokenMap, ExtractedCssInJsBlock } from "../../src/types.js";

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
