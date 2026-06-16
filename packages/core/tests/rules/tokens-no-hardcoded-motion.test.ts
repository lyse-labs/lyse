import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/tokens-no-hardcoded-motion.js";
import type { RuleContext, ParsedFiles, TokenMap, ExtractedCssInJsBlock } from "../../src/types.js";

function makeCtx(repoRoot: string, tokens: TokenMap | null = null): RuleContext {
  return { repoRoot, tokens, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] };
}
function makeParsed(opts: { css?: { path: string; source: string }[]; cssInJs?: ExtractedCssInJsBlock[] } = {}): ParsedFiles {
  return { ts: [], css: opts.css ?? [], cssInJs: opts.cssInJs ?? [] };
}
function tokensWithMotion(): TokenMap {
  return { motion: new Map([["duration/200ms", ["motion.fast"]], ["easing/cubic-bezier(0.4, 0, 0.2, 1)", ["motion.standard"]]]) } as unknown as TokenMap;
}

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "lyse-motion-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe("rule tokens/no-hardcoded-motion", () => {
  it("flags a hardcoded transition-duration with no scale", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".x { transition-duration: 240ms; }" }] }));
    expect(r.findings.some((f) => f.message.includes("240ms"))).toBe(true);
    expect(r.findings[0]!.ruleId).toBe("tokens/no-hardcoded-motion");
  });
  it("flags the duration inside a `transition` shorthand but not the `ease` keyword", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".x { transition: all 0.3s ease; }" }] }));
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.message).toMatch(/0\.3s/);
  });
  it("flags a custom cubic-bezier() easing", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".x { transition-timing-function: cubic-bezier(0.1, 0.2, 0.3, 0.4); }" }] }));
    expect(r.findings.some((f) => f.message.includes("cubic-bezier"))).toBe(true);
  });
  it("does not flag a standard named easing keyword", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".x { transition-timing-function: ease-in-out; }" }] }));
    expect(r.findings).toHaveLength(0);
  });
  it("does not flag zero duration", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".x { transition-duration: 0s; }" }] }));
    expect(r.findings).toHaveLength(0);
  });
  it("does not flag var()", async () => {
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".x { transition: var(--motion-fast); }" }] }));
    expect(r.findings).toHaveLength(0);
  });
  it("does not flag on-scale duration / easing", async () => {
    const css = [
      { path: "a.css", source: ".x { transition-duration: 200ms; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }" },
    ];
    const r = await rule.evaluate(makeCtx(tmp, tokensWithMotion()), makeParsed({ css }));
    expect(r.findings).toHaveLength(0);
  });
  it("is allowlisted via README", async () => {
    writeFileSync(join(tmp, "README.md"), "lyse-disable tokens/no-hardcoded-motion\n");
    const r = await rule.evaluate(makeCtx(tmp), makeParsed({ css: [{ path: "a.css", source: ".x { transition-duration: 240ms; }" }] }));
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  describe("_internal.extractMotion", () => {
    it("captures durations (not 0) and cubic-bezier easings, not keywords", () => {
      const hits = _internal.extractMotion(".x{transition:all 0.3s ease;transition-timing-function:cubic-bezier(0,0,1,1)}");
      const kinds = hits.map((h) => h.kind).sort();
      expect(kinds).toEqual(["duration", "easing"]);
    });
  });
});
