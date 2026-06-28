/**
 * TDD guard: three clean general FP guards for tokens/no-hardcoded-color.
 *
 * Fix A — hex inside a CSS attribute selector is NOT a declared color.
 *   `[stroke='#ccc'] { ... }` / `[data-color="#fff"]` — the hex is part of
 *   the selector expression, not a property value. Must NOT flag.
 *
 * Fix B — skip Tailwind-compiled CSS (generated artifact).
 *   Files whose first ~200 chars contain a `/*! tailwindcss v...` banner are
 *   generated build output, not authored source. Must NOT flag.
 *
 * Fix C — bare `vendor/` root path (edge case from prior review note).
 *   `vendor/foo.css` starts at the repo root with no leading `/vendor/` prefix,
 *   so the existing `/vendor/` segment check misses it. Extend to also catch
 *   paths that START with `vendor/` or `vendored/` (without leading slash).
 *
 * Recall guards: real declarations MUST still flag.
 */

import { describe, it, expect } from "vitest";
import { rule, detectInText } from "../../src/rules/tokens-no-hardcoded-color.js";
import { isVendoredOrResetFile } from "../../src/rules/_skip-context.js";
import type { RuleContext, ParsedFiles, TokenMap } from "../../src/types.js";

const emptyTokens: TokenMap = {
  colors: new Map(),
  spacing: new Map(),
  typography: new Map(),
  radii: new Map(),
  shadows: new Map(),
  motion: new Map(),
  breakpoints: new Map(),
  zIndex: new Map(),
  opacity: new Map(),
  borderWidth: new Map(),
  source: "tailwind-v3",
};

const ctx: RuleContext = {
  repoRoot: "/repo",
  tokens: emptyTokens,
  componentsModule: null,
  componentInventory: [],
  storyIndex: null,
  excludePaths: [],
};

function cssFile(path: string, source: string): ParsedFiles {
  return { ts: [], css: [{ path, source, root: null }], cssInJs: [] };
}

// ---------------------------------------------------------------------------
// Fix A: CSS attribute-selector hex — must NOT flag
// ---------------------------------------------------------------------------

describe("Fix A: hex inside CSS attribute selector — must NOT flag", () => {
  it("does not flag hex in [stroke='#ccc'] attribute selector", () => {
    const hits = detectInText(`[stroke='#ccc'] { display: block; }`, "test.css", true);
    expect(hits).toHaveLength(0);
  });

  it(`does not flag hex in [data-color="#fff"] attribute selector`, () => {
    const hits = detectInText(`[data-color="#fff"] { color: inherit; }`, "test.css", true);
    expect(hits).toHaveLength(0);
  });

  it("does not flag hex in [fill='#abc123'] attribute selector", () => {
    const hits = detectInText(`svg [fill='#abc123'] path { opacity: 1; }`, "test.css", true);
    expect(hits).toHaveLength(0);
  });

  it("does not flag hex in multi-rule sheet with attr selector", async () => {
    const source = `
[stroke='#ccc'] { display: block; }
.icon { width: 24px; }
`;
    const result = await rule.evaluate(ctx, cssFile("src/icons.css", source));
    expect(result.findings).toHaveLength(0);
  });

  // Recall guard: a real property value MUST still flag
  it("still flags stroke: #ccc as a real CSS property declaration", () => {
    const hits = detectInText(`.icon { stroke: #ccc; }`, "test.css", true);
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });

  it("still flags color: #ccc in an authored CSS file", async () => {
    const result = await rule.evaluate(ctx, cssFile("src/button.css", `.x { color: #ccc; }`));
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
  });

  it("still flags background: #fff in authored CSS", async () => {
    const result = await rule.evaluate(ctx, cssFile("src/card.css", `.card { background: #fff; }`));
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Fix B: Tailwind-compiled CSS banner — must NOT flag
// ---------------------------------------------------------------------------

describe("Fix B: Tailwind compiled CSS (generator banner) — must NOT flag", () => {
  it("does not flag hex in a file starting with tailwindcss banner (v3)", async () => {
    const source = `/*! tailwindcss v3.4.0 | MIT License | https://tailwindcss.com */
*,::after,::before{box-sizing:border-box}
.text-blue-500 { --tw-text-opacity:1; color: rgb(59 130 246/var(--tw-text-opacity)) }
.bg-white { background-color: #ffffff; }
`;
    const result = await rule.evaluate(ctx, cssFile("dist/styles.css", source));
    expect(result.findings).toHaveLength(0);
  });

  it("does not flag hex in a file starting with tailwindcss banner (v4)", async () => {
    const source = `/*! tailwindcss v4.0.0 | MIT License | https://tailwindcss.com */
.foo { color: #123456; }
`;
    const result = await rule.evaluate(ctx, cssFile("public/tw-output.css", source));
    expect(result.findings).toHaveLength(0);
  });

  // Recall guard: a non-tailwind CSS file with the same color MUST flag
  it("still flags hex in a regular authored CSS file (no tailwindcss banner)", async () => {
    const source = `.card { background-color: #ffffff; }`;
    const result = await rule.evaluate(ctx, cssFile("src/card.css", source));
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
  });

  it("still flags hex in a file that only mentions tailwindcss in a non-banner comment", async () => {
    // The banner must be at file start — a mid-file comment should not suppress
    const source = `/* using tailwindcss for utilities */\n.card { color: #ff0000; }`;
    const result = await rule.evaluate(ctx, cssFile("src/card.css", source));
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Fix C: bare vendor/ / vendored/ root path — isVendoredOrResetFile
// ---------------------------------------------------------------------------

describe("Fix C: bare vendor/ root path — isVendoredOrResetFile", () => {
  it("returns true for vendor/foo.css (bare root path, no leading /)", () => {
    expect(isVendoredOrResetFile("vendor/foo.css")).toBe(true);
  });

  it("returns true for vendor/react-tel-input/styles.css", () => {
    expect(isVendoredOrResetFile("vendor/react-tel-input/styles.css")).toBe(true);
  });

  it("returns true for vendored/bootstrap.css (bare root path)", () => {
    expect(isVendoredOrResetFile("vendored/bootstrap.css")).toBe(true);
  });

  it("does not flag hex in CSS at vendor/ bare root path", async () => {
    const result = await rule.evaluate(
      ctx,
      cssFile("vendor/some-lib/styles.css", `.x { color: #ff5733; background: #ffffff; }`),
    );
    expect(result.findings).toHaveLength(0);
  });

  // Recall guard: non-vendored paths must still be checked
  it("still flags hex in src/components/vendor-notes.css (not a vendor/ dir)", async () => {
    // 'vendor' appears in the filename but it's in src/components/ — not a vendor dir
    const result = await rule.evaluate(
      ctx,
      cssFile("src/components/vendor-notes.css", `.x { color: #ff5733; }`),
    );
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
  });

  it("still returns false for src/thevendor/foo.css (not a vendor segment)", () => {
    // 'thevendor' is NOT the same as 'vendor/' — must not overfit
    expect(isVendoredOrResetFile("src/thevendor/foo.css")).toBe(false);
  });
});
