import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/a11y-prefers-reduced-motion.js";
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
  tmp = mkdtempSync(join(tmpdir(), "lyse-reduced-motion-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("rule a11y/prefers-reduced-motion", () => {
  it("flags CSS that transitions without any prefers-reduced-motion guard", async () => {
    const parsed = makeParsed({
      css: [{ path: "src/button.css", source: ".btn { transition: all 0.2s ease; }" }],
    });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.ruleId).toBe("a11y/prefers-reduced-motion");
    expect(result.findings[0]!.axis).toBe("a11y");
    expect(result.opportunities).toBe(1);
  });

  it("does not flag when a prefers-reduced-motion media query is present", async () => {
    const parsed = makeParsed({
      css: [
        { path: "src/button.css", source: ".btn { transition: all 0.2s ease; }" },
        { path: "src/motion.css", source: "@media (prefers-reduced-motion: reduce) { .btn { transition: none; } }" },
      ],
    });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(1);
  });

  it("treats `transition: none` as no motion (no finding, N/A)", async () => {
    const parsed = makeParsed({
      css: [{ path: "src/x.css", source: ".x { transition: none; animation: none; }" }],
    });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });

  it("emits nothing and is N/A when there is no motion at all", async () => {
    const parsed = makeParsed({ css: [{ path: "src/x.css", source: ".x { color: red; }" }] });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });

  it("detects motion in a CSS-in-JS block", async () => {
    const parsed = makeParsed({
      cssInJs: [{ path: "Box.tsx", line: 3, content: "animation: spin 1s linear infinite;" }],
    });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(1);
  });

  it("flags @keyframes usage without a guard", async () => {
    const parsed = makeParsed({
      css: [{ path: "src/anim.css", source: "@keyframes spin { to { transform: rotate(360deg); } }" }],
    });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(1);
  });

  it("accepts a JS matchMedia('(prefers-reduced-motion...)') guard in TS source", async () => {
    const parsed = makeParsed({
      css: [{ path: "src/button.css", source: ".btn { transition: all 0.2s ease; }" }],
      ts: [{ path: "src/useMotion.ts", source: "const m = window.matchMedia('(prefers-reduced-motion: reduce)');" }],
    });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("is allowlisted by a README lyse-disable directive", async () => {
    writeFileSync(join(tmp, "README.md"), "# DS\n\nlyse-disable a11y/prefers-reduced-motion\n");
    const parsed = makeParsed({
      css: [{ path: "src/button.css", source: ".btn { transition: all 0.2s ease; }" }],
    });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });

  describe("_internal.usesMotionInText", () => {
    it("true for a real transition/animation, false for none/0s", () => {
      expect(_internal.usesMotionInText(".a { transition: all .2s; }")).toBe(true);
      expect(_internal.usesMotionInText(".a { animation: spin 1s; }")).toBe(true);
      expect(_internal.usesMotionInText("@keyframes k { from {} to {} }")).toBe(true);
      expect(_internal.usesMotionInText(".a { transition: none; }")).toBe(false);
      expect(_internal.usesMotionInText(".a { color: red; }")).toBe(false);
    });
  });
});
