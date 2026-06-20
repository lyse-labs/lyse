import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/tokens-no-hardcoded-gradient.js";
import type { RuleContext, ParsedFiles, ExtractedCssInJsBlock } from "../../src/types.js";

function makeCtx(repoRoot: string): RuleContext {
  return { repoRoot, tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] };
}
function makeParsed(opts: { css?: { path: string; source: string }[]; cssInJs?: ExtractedCssInJsBlock[] } = {}): ParsedFiles {
  return { ts: [], css: opts.css ?? [], cssInJs: opts.cssInJs ?? [] };
}

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "lyse-gradient-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe("rule tokens/no-hardcoded-gradient", () => {
  it("flags an inline linear-gradient in a normal property", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".hero { background: linear-gradient(90deg, #f00, #00f); }" }] }));
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.ruleId).toBe("tokens/no-hardcoded-gradient");
    expect(r.opportunities).toBe(1);
  });

  it("flags radial, conic and repeating gradients", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".a{background:radial-gradient(circle,#fff,#000)}.b{background:conic-gradient(#fff,#000)}.c{background:repeating-linear-gradient(45deg,#fff,#000 10px)}" }] }));
    expect(r.findings).toHaveLength(3);
  });

  it("does not flag a gradient defined as a CSS custom property (token definition)", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ":root { --gradient-brand: linear-gradient(90deg, #f00, #00f); }" }] }));
    expect(r.findings).toHaveLength(0);
  });

  it("does not flag a tokenized gradient reference via var()", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".hero { background: var(--gradient-brand); }" }] }));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("does not flag a gradient inside a comment", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: "/* background: linear-gradient(90deg, #f00, #00f) was here */\n.x { color: red; }" }] }));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("flags a hardcoded gradient in a CSS-in-JS block", async () => {
    const block: ExtractedCssInJsBlock = { path: "Hero.tsx", line: 7, content: "background: linear-gradient(180deg, #111, #222);" };
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ cssInJs: [block] }));
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.location.line).toBe(7);
  });

  it("reports N/A (zero opportunities) when there is no gradient", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".x { background: #fff; }" }] }));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("is allowlisted via README", async () => {
    writeFileSync(join(tmp, "README.md"), "lyse-disable tokens/no-hardcoded-gradient\n");
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".hero { background: linear-gradient(90deg, #f00, #00f); }" }] }));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("exposes internals for testing", () => {
    expect(typeof _internal.isAllowlisted).toBe("function");
    expect(typeof _internal.extractGradients).toBe("function");
  });
});
