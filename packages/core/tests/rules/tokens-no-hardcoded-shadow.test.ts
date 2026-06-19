import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/tokens-no-hardcoded-shadow.js";
import type { RuleContext, ParsedFiles, TokenMap, ExtractedCssInJsBlock } from "../../src/types.js";

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
