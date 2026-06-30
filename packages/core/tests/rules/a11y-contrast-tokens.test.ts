import { describe, it, expect } from "vitest";
import type { RuleContext, ParsedFiles, ParsedTsFile } from "../../src/types.js";
import { rule } from "../../src/rules/a11y-contrast-tokens.js";

// #949494 on #ffffff ≈ 3.03 — above 3.0 (passes large-text) but below 4.5 (fails normal)
// #999999 on #ffffff ≈ 2.85 — fails both thresholds
// #111111 on #ffffff ≈ 18.88 — passes both thresholds
// #767676 on #ffffff ≈ 4.54 — passes AA-normal (≥4.5)

const PKG = JSON.stringify({ name: "fx", version: "1.0.0" });

function makeCtx(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    repoRoot: ".",
    tokens: null,
    componentsModule: null,
    componentInventory: [],
    storyIndex: null,
    excludePaths: [],
    ...overrides,
  };
}

function makeParsed(opts: {
  css?: { path: string; source: string }[];
  cssInJs?: { path: string; line: number; content: string }[];
  ts?: { path: string; source: string }[];
} = {}): ParsedFiles {
  const ts: ParsedTsFile[] = (opts.ts ?? []).map((f) => ({
    path: f.path,
    ast: null,
    source: f.source,
    imports: [],
  }));
  return {
    ts,
    css: opts.css ?? [],
    cssInJs: opts.cssInJs ?? [],
  };
}

describe("a11y/contrast-tokens", () => {
  it("flags a co-applied low-contrast literal pair in CSS (background shorthand)", async () => {
    const parsed = makeParsed({
      css: [{ path: "src/a.css", source: ".x { color: #999999; background: #ffffff; }" }],
    });
    const result = await rule.evaluate(makeCtx(), parsed);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0]!.ruleId).toBe("a11y/contrast-tokens");
    expect(result.findings[0]!.axis).toBe("a11y");
    expect(result.findings[0]!.severity).toBe("warning");
    expect(result.findings[0]!.message).toContain("WCAG AA");
  });

  it("flags a co-applied low-contrast pair using background-color property", async () => {
    const parsed = makeParsed({
      css: [{ path: "src/a.css", source: ".x { color: #999999; background-color: #ffffff; }" }],
    });
    const result = await rule.evaluate(makeCtx(), parsed);
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("does NOT flag a passing pair (18.88:1 >> 4.5)", async () => {
    const parsed = makeParsed({
      css: [{ path: "src/a.css", source: ".x { color: #111111; background: #ffffff; }" }],
    });
    const result = await rule.evaluate(makeCtx(), parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag when only color is present (no background)", async () => {
    const parsed = makeParsed({
      css: [{ path: "src/a.css", source: ".x { color: #999999; }" }],
    });
    const result = await rule.evaluate(makeCtx(), parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag when only background is present (no foreground)", async () => {
    const parsed = makeParsed({
      css: [{ path: "src/a.css", source: ".x { background: #ffffff; }" }],
    });
    const result = await rule.evaluate(makeCtx(), parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("skips when background is a gradient (not a solid color)", async () => {
    const parsed = makeParsed({
      css: [{ path: "src/a.css", source: ".x { color: #999; background: linear-gradient(#fff, #000); }" }],
    });
    const result = await rule.evaluate(makeCtx(), parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("skips when background is a url()", async () => {
    const parsed = makeParsed({
      css: [{ path: "src/a.css", source: '.x { color: #999; background: url("img.png"); }' }],
    });
    const result = await rule.evaluate(makeCtx(), parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("skips when a side is alpha (rgba with alpha < 1)", async () => {
    const parsed = makeParsed({
      css: [{ path: "src/a.css", source: ".x { color: rgba(0,0,0,0.4); background: #fff; }" }],
    });
    const result = await rule.evaluate(makeCtx(), parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("skips when foreground is transparent", async () => {
    const parsed = makeParsed({
      css: [{ path: "src/a.css", source: ".x { color: transparent; background: #fff; }" }],
    });
    const result = await rule.evaluate(makeCtx(), parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("skips when foreground is currentColor", async () => {
    const parsed = makeParsed({
      css: [{ path: "src/a.css", source: ".x { color: currentColor; background: #fff; }" }],
    });
    const result = await rule.evaluate(makeCtx(), parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("skips when foreground is inherit", async () => {
    const parsed = makeParsed({
      css: [{ path: "src/a.css", source: ".x { color: inherit; background: #fff; }" }],
    });
    const result = await rule.evaluate(makeCtx(), parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("skips when a var() is unresolvable", async () => {
    const parsed = makeParsed({
      css: [{ path: "src/a.css", source: ".x { color: #999; background: var(--unknown-bg); }" }],
    });
    const result = await rule.evaluate(makeCtx(), parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("uses 3:1 for large text (font-size ≥ 24px) — #949494 on #fff passes large-text threshold", async () => {
    // #949494 on #fff ≈ 3.03 — above 3.0 (passes AA large-text) but below 4.5 (fails AA normal)
    const parsed = makeParsed({
      css: [{ path: "src/a.css", source: ".x { color: #949494; background: #fff; font-size: 28px; }" }],
    });
    const result = await rule.evaluate(makeCtx(), parsed);
    expect(result.findings, "large text uses the 3:1 threshold, 3.03:1 should pass").toHaveLength(0);
  });

  it("uses 3:1 for bold large text (font-size ≥ 18.66px + font-weight ≥ 700)", async () => {
    // #949494 on #fff ≈ 3.03 — above 3.0 (passes bold large-text threshold)
    const parsed = makeParsed({
      css: [{ path: "src/a.css", source: ".x { color: #949494; background: #fff; font-size: 20px; font-weight: 700; }" }],
    });
    const result = await rule.evaluate(makeCtx(), parsed);
    expect(result.findings, "bold large text uses the 3:1 threshold, 3.03:1 should pass").toHaveLength(0);
  });

  it("still flags large text that fails even the 3:1 threshold", async () => {
    // #999999 on #fff ≈ 2.85 — fails even large-text threshold of 3.0
    const parsed = makeParsed({
      css: [{ path: "src/a.css", source: ".x { color: #999999; background: #fff; font-size: 28px; }" }],
    });
    const result = await rule.evaluate(makeCtx(), parsed);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0]!.message).toContain("3");
  });

  it("flags low-contrast pair in CSS-in-JS block", async () => {
    const parsed = makeParsed({
      cssInJs: [{
        path: "src/Button.tsx",
        line: 5,
        content: "color: #999999; background: #ffffff;",
      }],
    });
    const result = await rule.evaluate(makeCtx(), parsed);
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("counts opportunities for each resolvable co-applied pair", async () => {
    const parsed = makeParsed({
      css: [
        {
          path: "src/a.css",
          source: `.a { color: #999; background: #fff; }
.b { color: #111; background: #fff; }`,
        },
      ],
    });
    const result = await rule.evaluate(makeCtx(), parsed);
    expect(result.opportunities).toBe(2);
    // Only .a fails (2.85:1 < 4.5); .b passes (18.88:1 > 4.5)
    expect(result.findings).toHaveLength(1);
  });

  it("skips var() references (forward map unavailable — recall-safe)", async () => {
    // var() references cannot be resolved without the DTCG forward map;
    // ctx.tokens is a reverse (hex→paths) map and cannot resolve path→hex.
    const parsed = makeParsed({
      css: [{ path: "src/a.css", source: ".x { color: var(--color-fg); background: var(--color-bg); }" }],
    });
    const result = await rule.evaluate(makeCtx(), parsed);
    expect(result.findings, "both sides are var() — unresolvable → skip").toHaveLength(0);
  });

  it("does not flag multi-layer background (space-separated)", async () => {
    const parsed = makeParsed({
      css: [{ path: "src/a.css", source: ".x { color: #999; background: url(bg.png) #fff; }" }],
    });
    const result = await rule.evaluate(makeCtx(), parsed);
    expect(result.findings).toHaveLength(0);
  });
});
