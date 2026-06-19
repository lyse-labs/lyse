import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/tokens-no-hardcoded-opacity.js";
import type { RuleContext, ParsedFiles, TokenMap, ExtractedCssInJsBlock } from "../../src/types.js";

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
