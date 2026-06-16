import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule } from "../../src/rules/tokens-no-hardcoded-border-radius.js";
import type { RuleContext, ParsedFiles, TokenMap, ExtractedCssInJsBlock } from "../../src/types.js";

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
});
