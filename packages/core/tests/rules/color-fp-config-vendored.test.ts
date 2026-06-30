/**
 * TDD guard: config / vendored FP class for tokens/no-hardcoded-color.
 *
 * Real snippets from the color-harvest labeled dataset
 * (docs/superpowers/color-harvest-labels.md), fpClass "config":
 *
 *   ids 1-8:  .yarn/releases/yarn-4.17.0.cjs — Yarn PnP binary; .yarn/ path
 *   id 48:    src/base/normalize.scss:307 — browser normalize, #c0c0c0
 *   id 87:    apps/v4/hooks/use-meta-color.ts — META_THEME_COLORS {light:"#ffffff",dark:"#0a0a0a"}
 *             (RESIDUAL — cannot generalize without repo-specific name)
 *   ids 88-89, 141-150: chart.tsx fill="#ccc" Recharts override
 *             (RESIDUAL — cannot generalize without Recharts-specific knowledge)
 *   ids 90-103: oklch(from var(--primary) l c h) — already suppressed by colorFnHasNonLiteralArg
 *   ids 134-140: color-mix(in oklch, var(...)) — not matched by COLOR_FUNC (no finding)
 *
 * Detection signals used (general — no repo-specific names):
 *   1. Path exclusion: .yarn/, bower_components/, vendor/, vendored/, third_party/
 *      (extended in _exclude.ts — affects all rules, but correct for all)
 *   2. Basename: normalize.{css,scss,sass,less}, reset.{css,scss,sass,less},
 *      *.min.{css,scss} — browser reset/normalize files are never DS-authored styles
 *
 * Recall guards: real hardcoded colors in DS component stylesheets MUST still flag.
 */
import { describe, it, expect } from "vitest";
import { rule } from "../../src/rules/tokens-no-hardcoded-color.js";
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

// ---------------------------------------------------------------------------
// Helper to build a minimal ParsedFiles with a single CSS file
// ---------------------------------------------------------------------------
function cssFile(path: string, source: string): ParsedFiles {
  return {
    ts: [],
    css: [{ path, source, root: null }],
    cssInJs: [],
  };
}

function tsFile(path: string, source: string): ParsedFiles {
  return {
    ts: [{ path, source, imports: [], ast: null }],
    css: [],
    cssInJs: [],
  };
}

// ---------------------------------------------------------------------------
// isVendoredOrResetFile unit tests
// ---------------------------------------------------------------------------
describe("isVendoredOrResetFile", () => {
  it("returns true for .yarn/ release path (Yarn PnP binary)", () => {
    expect(isVendoredOrResetFile(".yarn/releases/yarn-4.17.0.cjs")).toBe(true);
  });

  it("returns true for nested .yarn/ path", () => {
    expect(isVendoredOrResetFile("repo/.yarn/cache/lodash.zip")).toBe(true);
  });

  it("returns true for bower_components/", () => {
    expect(isVendoredOrResetFile("bower_components/normalize/normalize.css")).toBe(true);
  });

  it("returns true for vendor/ directory", () => {
    expect(isVendoredOrResetFile("src/vendor/some-lib.css")).toBe(true);
  });

  it("returns true for vendored/ directory", () => {
    expect(isVendoredOrResetFile("lib/vendored/bootstrap.min.css")).toBe(true);
  });

  it("returns true for third_party/ directory", () => {
    expect(isVendoredOrResetFile("third_party/sanitize.css")).toBe(true);
  });

  it("returns true for normalize.scss (dataset id 48)", () => {
    expect(isVendoredOrResetFile("src/base/normalize.scss")).toBe(true);
  });

  it("returns true for normalize.css", () => {
    expect(isVendoredOrResetFile("styles/normalize.css")).toBe(true);
  });

  it("returns true for _normalize.scss", () => {
    expect(isVendoredOrResetFile("scss/_normalize.scss")).toBe(true);
  });

  it("returns true for reset.css", () => {
    expect(isVendoredOrResetFile("src/reset.css")).toBe(true);
  });

  it("returns true for reset.scss", () => {
    expect(isVendoredOrResetFile("base/_reset.scss")).toBe(true);
  });

  it("returns true for *.min.css (minified — third-party bundle)", () => {
    expect(isVendoredOrResetFile("dist/vendor.min.css")).toBe(true);
  });

  it("returns false for src/components/Button.css (real DS source)", () => {
    expect(isVendoredOrResetFile("src/components/Button.css")).toBe(false);
  });

  it("returns false for src/theme/tokens.css (real DS source)", () => {
    expect(isVendoredOrResetFile("src/theme/tokens.css")).toBe(false);
  });

  it("returns false for packages/@lib/src/Alert.module.scss", () => {
    expect(isVendoredOrResetFile("packages/@lib/src/Alert.module.scss")).toBe(false);
  });

  it("returns false for apps/help.site/src/styles/global.css", () => {
    expect(isVendoredOrResetFile("apps/help.site/src/styles/global.css")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rule-level: .yarn/ path — must NOT flag (dataset ids 1-8)
// ---------------------------------------------------------------------------
describe("rule: .yarn/ vendored path — must NOT flag", () => {
  it("does not flag hex in .yarn/releases/*.cjs", async () => {
    // Simulates dataset id 1-8: .yarn/releases/yarn-4.17.0.cjs with hex literals
    const parsed = tsFile(
      ".yarn/releases/yarn-4.17.0.cjs",
      `var TERM_RESET = "#ffffff"; var ERROR_COLOR = "#ff0000";`,
    );
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does not flag hex in .yarn/cache/.zip", async () => {
    const parsed = tsFile(
      ".yarn/cache/pkg-npm-1.0.0.zip",
      `const c = "#2563eb";`,
    );
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does not flag colors in bower_components/", async () => {
    const parsed = cssFile(
      "bower_components/normalize/normalize.css",
      `fieldset { border: 1px solid #c0c0c0; }`,
    );
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does not flag colors in vendor/", async () => {
    const parsed = cssFile(
      "src/vendor/animate.css",
      `.fade { color: #333333; }`,
    );
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Rule-level: normalize/reset files — must NOT flag (dataset id 48)
// ---------------------------------------------------------------------------
describe("rule: normalize / reset CSS files — must NOT flag", () => {
  it("does not flag #c0c0c0 in normalize.scss (dataset id 48)", async () => {
    const parsed = cssFile(
      "src/base/normalize.scss",
      `fieldset { border: 1px solid #c0c0c0; margin: 0 2px; }`,
    );
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does not flag hex in reset.css", async () => {
    const parsed = cssFile(
      "styles/reset.css",
      `body { background: #ffffff; color: #000000; }`,
    );
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does not flag hex in _reset.scss", async () => {
    const parsed = cssFile(
      "src/base/_reset.scss",
      `a { color: #0070f3; }`,
    );
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does not flag hex in *.min.css (minified vendor bundle)", async () => {
    const parsed = cssFile(
      "dist/bootstrap.min.css",
      `.btn { background-color: #0d6efd; border-color: #0d6efd; }`,
    );
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Recall guards — real hardcoded colors in DS components MUST still flag
// ---------------------------------------------------------------------------
describe("recall: real DS component colors MUST still flag", () => {
  it("flags rgba in ActionIcon.module.css (dataset id 34 TP)", async () => {
    const parsed = cssFile(
      "packages/@mantine/core/src/components/ActionIcon/ActionIcon.module.css",
      `.icon { box-shadow: 0 0 0 2px rgba(0,0,0,0.15); }`,
    );
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
  });

  it("flags rgba in src/components/Button.css (real source)", async () => {
    const parsed = cssFile(
      "src/components/Button.css",
      `.btn { background: rgba(255, 255, 255, 0.2); }`,
    );
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
  });

  it("flags hex in src/components/Banner.module.css", async () => {
    const parsed = cssFile(
      "src/components/Banner.module.css",
      `.banner { color: #2563eb; }`,
    );
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
  });

  it("flags hex in a non-vendored TS component", async () => {
    const parsed = tsFile(
      "src/components/Card.tsx",
      `const style = { background: "#ffffff", color: "#0a0a0a" };`,
    );
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
  });

  it("flags colors in a src/styles/global.css (not vendored)", async () => {
    const parsed = cssFile(
      "src/styles/global.css",
      `body { background: #f5f5f5; }`,
    );
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
  });
});
