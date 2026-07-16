/**
 * TDD guard: data-palette FP class for tokens/no-hardcoded-color.
 *
 * Real snippets from the color-harvest labeled dataset
 * (color-harvest-labels.md, archived in lyse-internal), fpClass "data-palette":
 *
 *   id 13:  apps/mantine.dev/src/components/ColorsGenerator/ColorsInput/colors-preset.ts:2
 *           — reference color preset list for color generator UI
 *           — path contains "ColorsGenerator"
 *   id 23-33: packages/@mantine/code-highlight/src/CodeHighlightProvider/adapters/shiki-themes.ts
 *           — Shiki syntax highlight theme (large object: comment→hex, keyword→hex, …)
 *           — path contains "shiki-themes"
 *   id 44:  packages/@mantinex/colors-generator/src/ColorsGenerator/ColorsGenerator.tsx:12
 *           — reference palette array for color generation algorithm
 *           — path contains "ColorsGenerator"
 *
 * Detection approach used (GENERAL — structural palette/collection signal):
 *   A color literal is suppressed when it appears inside a block (between the
 *   nearest enclosing { … } or [ … ]) that contains ≥ 3 distinct color literals
 *   in total. This is "palette density" — not path-specific.
 *
 *   Threshold = 3: a lone hardcoded color or a two-color pair is still drift; a
 *   true palette or syntax-highlight theme always has many more entries.
 *
 * Chart fills (Recharts fill="#ccc"):
 *   These are already handled as fpClass "config" by the config guard (config
 *   task). No additional handling needed here; documented as not in scope.
 *
 * Residuals:
 *   - ColorPicker hue/saturation gradients (ids 38-39, fpClass "other"):
 *     These have ≤ 2 color literals in context; NOT suppressed by palette guard.
 *     They were left as residuals in prior tasks (ColorPicker path signal was
 *     deemed too repo-specific). Remain residual.
 *
 * Recall constraint:
 *   A LONE hardcoded color in a component style MUST still flag.
 *   An array with a single or two color literals (< threshold) MUST still flag.
 */
import { describe, it, expect } from "vitest";
import { rule, detectInText } from "../../src/rules/tokens-no-hardcoded-color.js";
import { isDataPaletteContext } from "../../src/rules/_skip-context.js";
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

function tsFile(path: string, source: string): ParsedFiles {
  return { ts: [{ path, source, imports: [], ast: null }], css: [], cssInJs: [] };
}

function cssFile(path: string, source: string): ParsedFiles {
  return { ts: [], css: [{ path, source, root: null }], cssInJs: [] };
}

// =============================================================================
// isDataPaletteContext unit tests — structural palette/collection signal
// =============================================================================

describe("isDataPaletteContext — structural palette signal", () => {
  // -- Multi-color ARRAY (≥3 color literals) — should suppress
  it("detects a multi-color array with ≥3 hex values as palette context", () => {
    const src = `const presets = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'];`;
    // Array threshold = 3; 4 colors → palette context.
    const idx = src.indexOf("'#ff0000'") + 1; // +1 to skip quote, land on #
    expect(isDataPaletteContext(src, idx)).toBe(true);
  });

  it("detects a multi-color array mid-item as palette context", () => {
    const src = `const colors = ['#111', '#222', '#333', '#444', '#555'];`;
    const idx = src.indexOf("'#333'") + 1;
    expect(isDataPaletteContext(src, idx)).toBe(true);
  });

  // -- Multi-color OBJECT (≥5 color-valued properties — higher threshold for objects)
  it("detects a syntax-highlight theme object (≥5 color properties) as palette context", () => {
    // Object threshold = 5; this object has 5 color-valued properties.
    const src = `const theme = {
  comment: '#6a9955',
  keyword: '#569cd6',
  string: '#ce9178',
  number: '#b5cea8',
  function: '#dcdcaa',
};`;
    const idx = src.indexOf("'#569cd6'") + 1;
    expect(isDataPaletteContext(src, idx)).toBe(true);
  });

  it("detects a colors-preset array (ColorsGenerator dataset pattern) as palette context", () => {
    // Mirrors id 13: colors-preset.ts — ['#fff7f7', '#ffe3e3', '#ffc9c9', ...]
    const src = `export const colorsPreset = [
  '#fff7f7', '#ffe3e3', '#ffc9c9', '#ffa8a8', '#ff8787',
  '#ff6b6b', '#fa5252', '#f03e3e', '#e03131', '#c92a2a',
];`;
    const idx = src.indexOf("'#ffe3e3'") + 1;
    expect(isDataPaletteContext(src, idx)).toBe(true);
  });

  // -- Small collections (< threshold) — must NOT suppress
  it("does NOT suppress a lone hardcoded color (no palette context)", () => {
    const src = `const style = { background: '#2563eb' };`;
    const idx = src.indexOf("'#2563eb'") + 1;
    expect(isDataPaletteContext(src, idx)).toBe(false);
  });

  it("does NOT suppress a 2-color pair (below threshold)", () => {
    const src = `const pair = ['#ffffff', '#000000'];`;
    const idx = src.indexOf("'#ffffff'") + 1;
    expect(isDataPaletteContext(src, idx)).toBe(false);
  });

  it("does NOT suppress a 2-color object (below threshold)", () => {
    const src = `const c = { light: '#ffffff', dark: '#000000' };`;
    const idx = src.indexOf("'#ffffff'") + 1;
    expect(isDataPaletteContext(src, idx)).toBe(false);
  });

  it("does NOT suppress a 4-color object (below object threshold of 5)", () => {
    // Object threshold = 5; a component style with 4 hardcoded colors is still drift.
    const src = `const s = { bg: '#f5f5f5', color: '#333', border: '#ccc', shadow: '#000' };`;
    const idx = src.indexOf("'#f5f5f5'") + 1;
    expect(isDataPaletteContext(src, idx)).toBe(false);
  });

  it("does NOT suppress a JSX inline-style object with 3 colors (below object threshold)", () => {
    // Real storybook test case — 3 colors in style={{ }} is drift, not a palette.
    const src = `<div style={{ background: "#f5f5f5", color: "#333", border: "1px solid #ccc" }} />`;
    const idx = src.indexOf('"#f5f5f5"') + 1;
    expect(isDataPaletteContext(src, idx)).toBe(false);
  });

  // -- CSS context — should also work on color function values in arrays/objects
  it("detects palette when color functions (rgb) are the items", () => {
    const src = `const palette = [
  rgb(255, 0, 0),
  rgb(0, 255, 0),
  rgb(0, 0, 255),
  rgb(255, 255, 0),
];`;
    const idx = src.indexOf("rgb(0, 255, 0)");
    expect(isDataPaletteContext(src, idx)).toBe(true);
  });
});

// =============================================================================
// Rule integration — data-palette must NOT flag
// =============================================================================

describe("data-palette rule integration — must NOT flag palette collections", () => {
  it("does NOT flag hex in a large color preset array (dataset id 13 pattern)", async () => {
    // Mirrors: apps/mantine.dev/src/components/ColorsGenerator/ColorsInput/colors-preset.ts
    const src = `export const colorsPreset = [
  '#fff7f7', '#ffe3e3', '#ffc9c9', '#ffa8a8', '#ff8787',
  '#ff6b6b', '#fa5252', '#f03e3e', '#e03131', '#c92a2a',
];`;
    const parsed = tsFile(
      "apps/mantine.dev/src/components/ColorsGenerator/ColorsInput/colors-preset.ts",
      src,
    );
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag hex in a Shiki syntax-highlight theme object (dataset ids 23-33)", async () => {
    // Mirrors: packages/@mantine/code-highlight/src/CodeHighlightProvider/adapters/shiki-themes.ts
    // Real Shiki themes use a flat color-map object with many hex entries.
    // The dataset entries at lines 37, 73, 108, etc. are all in this flat structure.
    const src = `export const oneDarkPro = {
  name: 'One Dark Pro',
  type: 'dark',
  fg: '#abb2bf',
  bg: '#282c34',
  comment: '#5c6370',
  keyword: '#c678dd',
  string: '#98c379',
  number: '#d19a66',
  function: '#61afef',
  variable: '#e06c75',
  operator: '#56b6c2',
  property: '#e5c07b',
};`;
    const parsed = tsFile(
      "packages/@mantine/code-highlight/src/CodeHighlightProvider/adapters/shiki-themes.ts",
      src,
    );
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag hex in a ColorsGenerator palette array (dataset id 44)", async () => {
    // Mirrors: packages/@mantinex/colors-generator/src/ColorsGenerator/ColorsGenerator.tsx:12
    // Reference palette array used by the generation algorithm
    const src = `const REFERENCE_COLORS = [
  '#e03131', '#2f9e44', '#1971c2', '#f08c00',
  '#ae3ec9', '#0c8599', '#e64980', '#343a40',
];`;
    const parsed = tsFile(
      "packages/@mantinex/colors-generator/src/ColorsGenerator/ColorsGenerator.tsx",
      src,
    );
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag hex in a palette object with ≥5 colors in any source file", async () => {
    // General structural case: not repo-specific.
    // Object threshold = 5; this has exactly 5 color entries → palette context.
    const src = `const brandPalette = {
  primary: '#2563eb',
  secondary: '#7c3aed',
  success: '#16a34a',
  danger: '#dc2626',
  warning: '#d97706',
};`;
    const parsed = tsFile("src/design-system/palette.ts", src);
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag hex in a color array in a generic chart-data file with ≥3 colors", async () => {
    // General case: chart color series defined as an array
    const src = `const CHART_COLORS = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f'];`;
    const parsed = tsFile("src/components/chart/colors.ts", src);
    // This file is already caught by isColorTokenDefFile (colors.ts basename)
    // The palette guard is a second structural layer — confirm no findings either way
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag hex in a multi-color const array in a non-token-def file", async () => {
    // Not in a token-def file, not in a special path: purely structural
    const src = `export const SERIES_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];`;
    const parsed = tsFile("src/components/Charts/PieChart.tsx", src);
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });
});

// =============================================================================
// Recall guards — lone/small colors MUST still flag
// =============================================================================

describe("data-palette recall — lone colors and small collections MUST still flag", () => {
  it("flags a LONE hardcoded color in a component style", async () => {
    const src = `export const Button = () => <div style={{ background: '#2563eb' }} />;`;
    const parsed = tsFile("src/components/Button.tsx", src);
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.message).toContain("#2563eb");
  });

  it("flags a hardcoded color in a CSS file (lone value)", async () => {
    const src = `.btn { background: #2563eb; color: #ffffff; }`;
    const parsed = cssFile("src/components/Button.css", src);
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
  });

  it("flags hardcoded colors in a 2-item array (below palette threshold)", async () => {
    const src = `const pair = ['#ffffff', '#000000'];`;
    const parsed = tsFile("src/components/Toggle.tsx", src);
    const result = await rule.evaluate(ctx, parsed);
    // Both items are below the palette threshold — MUST still flag
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
  });

  it("flags a hardcoded color in an object with only 1 color property", async () => {
    const src = `const style = { primaryColor: '#2563eb', fontSize: '16px', fontWeight: 'bold' };`;
    const parsed = tsFile("src/components/Heading.tsx", src);
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.message).toContain("#2563eb");
  });

  it("flags hardcoded colors in a component CSS with a few isolated values", async () => {
    // Component box-shadows and overlays are drift even if there are 2 colors
    const src = `.card { box-shadow: 0 2px 8px rgba(0,0,0,0.15); color: rgba(255,255,255,0.9); }`;
    const parsed = cssFile("src/components/Card.module.css", src);
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
  });

  it("flags a hardcoded color in a large object that has only 1 color property and many non-color properties", async () => {
    // The palette guard must count ONLY colors — not all properties
    const src = `const config = {
  name: 'my-theme',
  borderRadius: '4px',
  fontSize: '16px',
  fontFamily: 'Inter',
  primaryColor: '#2563eb',
  lineHeight: '1.5',
  spacing: '8px',
};`;
    const parsed = tsFile("src/components/ThemeConfig.tsx", src);
    const result = await rule.evaluate(ctx, parsed);
    // Only 1 color literal → not a palette → must still flag
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.message).toContain("#2563eb");
  });
});

// =============================================================================
// detectInText — unit-level palette suppression
// =============================================================================

describe("detectInText — palette collection suppression", () => {
  it("suppresses all hits in a multi-color hex array (≥3 colors)", () => {
    const src = `const p = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'];`;
    const hits = detectInText(src);
    expect(hits).toHaveLength(0);
  });

  it("suppresses all hits in a named-palette object (≥5 color properties)", () => {
    // Object threshold = 5; must have 5+ color entries to be treated as palette.
    const src = `const t = { a: '#111', b: '#222', c: '#333', d: '#444', e: '#555' };`;
    const hits = detectInText(src);
    expect(hits).toHaveLength(0);
  });

  it("does NOT suppress hits in a 2-color array", () => {
    const src = `const pair = ['#ffffff', '#000000'];`;
    const hits = detectInText(src);
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT suppress a lone hit in component JSX", () => {
    const src = `<div style={{ color: '#2563eb' }} />`;
    const hits = detectInText(src);
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });

  it("suppresses interior hits but NOT a lone color outside the palette block", () => {
    // Only the color inside the palette block should be suppressed;
    // the lone color outside must still be found.
    const src = `const p = ['#ff0000', '#00ff00', '#0000ff'];
const bg = '#2563eb';`;
    const hits = detectInText(src);
    // The 3 palette colors are suppressed; bg = '#2563eb' must still be found
    expect(hits).toHaveLength(1);
    expect(hits[0]?.match).toBe("#2563eb");
  });
});
