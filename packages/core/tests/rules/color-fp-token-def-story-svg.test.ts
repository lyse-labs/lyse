/**
 * TDD guard: token-def / story-test / svg-icon FP classes for tokens/no-hardcoded-color.
 *
 * Real snippets from the color-harvest labeled dataset
 * (docs/superpowers/color-harvest-labels.md):
 *
 * token-def (29 findings):
 *   id 21:  apps/mantine.dev/theme.ts:44 — color values in theme.ts
 *   id 61-81: src/marketing/support/variables.scss — Sass variable definitions
 *   ids 105-133: apps/v4/registry/themes.ts — token definition registry
 *
 * story-test (11 findings):
 *   id 22:  packages/@mantine-tests/core/src/shared/it-supports-style.tsx — @mantine-tests path
 *   ids 46-47: docs/.storybook/storybook.css, docs/.storybook/theme.js — .storybook/ CSS/JS
 *   ids 82-85: apps/ssr-testing/..., apps/storybook/stories/... — storybook/ssr-testing app paths
 *
 * svg-icon (10 findings):
 *   id 17-18: apps/mantine.dev/src/components/icons/ViteIcon.tsx — *Icon.tsx path + fill= on SVG
 *   id 19:    apps/mantine.dev/src/components/LogoAssets/assets/index.ts — SVG string in file
 *   id 45:    packages/@mantinex/dev-icons/src/CssIcon.tsx — Icon.tsx path
 *   id 86:    apps/v4/app/(app)/create/components/icon-library-picker.tsx — fill="#fff" on SVG path
 *
 * Detection signals used (general — no repo-specific names):
 *   token-def: basenames matching theme.ts, themes.ts, *theme*.ts/.js/.css/.scss,
 *              variables.{scss,css,less,sass}, *variables*.{scss,css}, or
 *              path segments /tokens/, /theme/ for .ts files; also Sass @include context
 *   story-test: path segment /.storybook/ extends isLowSignalValueFile (covers .stories.* etc.)
 *              apps/storybook/ + apps/ssr-testing/ REMOVED (review 2026-06-28: overfit/convention-specific)
 *   svg-icon: basenames *Icon.{tsx,jsx,ts,js,svg}, path segments /icons/, /icon/, /svg/,
 *             or .svg extension; fill= / stroke= content signal REMOVED (recall hole; review 2026-06-28)
 *
 * Residuals (non-generalizable, accepted):
 *   token-def: 0
 *   story-test: 4 — ids 82 (apps/ssr-testing/), 83-85 (apps/storybook/)
 *   svg-icon: 1 — id 86 (icon-library-picker.tsx — no icon path signal, content signal removed)
 */
import { describe, it, expect } from "vitest";
import { rule, detectInText } from "../../src/rules/tokens-no-hardcoded-color.js";
import {
  isColorTokenDefFile,
  isLowSignalValueFile,
  isSvgIconContext,
} from "../../src/rules/_skip-context.js";
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
function tsFile(path: string, source: string): ParsedFiles {
  return { ts: [{ path, source, imports: [], ast: null }], css: [], cssInJs: [] };
}

// =============================================================================
// TOKEN-DEF: isColorTokenDefFile — path helper unit tests
// =============================================================================
describe("isColorTokenDefFile — token-def new path patterns", () => {
  // theme.ts / themes.ts (dataset ids 21, 105-133)
  it("identifies theme.ts as a token-def file", () => {
    expect(isColorTokenDefFile("apps/mantine.dev/theme.ts")).toBe(true);
  });
  it("identifies themes.ts as a token-def file", () => {
    expect(isColorTokenDefFile("apps/v4/registry/themes.ts")).toBe(true);
  });
  it("identifies theme.js as a token-def file", () => {
    expect(isColorTokenDefFile("src/theme.js")).toBe(true);
  });

  // variables.scss / variables.css (dataset ids 61-81)
  it("identifies variables.scss as a token-def file", () => {
    expect(isColorTokenDefFile("src/marketing/support/variables.scss")).toBe(true);
  });
  it("identifies variables.css as a token-def file", () => {
    expect(isColorTokenDefFile("src/variables.css")).toBe(true);
  });
  it("identifies _variables.scss (Sass partial) as a token-def file", () => {
    expect(isColorTokenDefFile("scss/_variables.scss")).toBe(true);
  });
  it("identifies _tokens.scss as a token-def file", () => {
    expect(isColorTokenDefFile("src/_tokens.scss")).toBe(true);
  });

  // Recall guards — must NOT suppress
  it("does NOT suppress src/Button.tsx (real component)", () => {
    expect(isColorTokenDefFile("src/Button.tsx")).toBe(false);
  });
  it("does NOT suppress src/button.module.css (component stylesheet)", () => {
    expect(isColorTokenDefFile("src/button.module.css")).toBe(false);
  });
  it("does NOT suppress src/Card.tsx (real component)", () => {
    expect(isColorTokenDefFile("src/Card.tsx")).toBe(false);
  });
});

describe("token-def rule integration — must NOT flag", () => {
  it("does NOT flag hex in theme.ts (dataset id 21)", async () => {
    // apps/mantine.dev/theme.ts:44 — real token-def
    const parsed = tsFile(
      "apps/mantine.dev/theme.ts",
      `export const theme = { primaryColor: "#2563eb", secondaryColor: "#7c3aed" };`,
    );
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag hex in themes.ts registry (dataset ids 105-133)", async () => {
    // apps/v4/registry/themes.ts — shadcn theme registry
    const parsed = tsFile(
      "apps/v4/registry/themes.ts",
      `export const themes = [{ name: "zinc", cssVars: { light: { primary: "240 5.9% 10%" }, dark: { primary: "0 0% 98%" } } }];`,
    );
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag hex in variables.scss Sass definitions (dataset ids 61-80)", async () => {
    // src/marketing/support/variables.scss
    const parsed = cssFile(
      "src/marketing/support/variables.scss",
      `$mktg-btn-shadow-hover-light: 0 2px 8px rgba(255,255,255,0.15), 0 4px 16px rgba(0,0,0,0.3);`,
    );
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag hex in _variables.scss (design-token Sass partial)", async () => {
    const parsed = cssFile(
      "src/design-tokens/_variables.scss",
      `$brand-primary: #2563eb;\n$brand-secondary: #7c3aed;`,
    );
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });
});

describe("token-def recall — real component colors MUST still flag", () => {
  it("flags hex in src/components/Button.css (real component stylesheet)", async () => {
    const parsed = cssFile(
      "src/components/Button.css",
      `.btn { background: #2563eb; color: #ffffff; }`,
    );
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
  });

  it("flags hex in src/Button.tsx (real component)", async () => {
    const parsed = tsFile(
      "src/Button.tsx",
      `export const Button = () => <div style={{ color: "#ff0000" }} />;`,
    );
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(1);
  });

  it("flags hex in packages/@lib/src/Card.module.css (DS component)", async () => {
    const parsed = cssFile(
      "packages/@lib/src/Card.module.css",
      `.card { box-shadow: 0 0 0 2px rgba(0,0,0,0.15); }`,
    );
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// STORY-TEST: isLowSignalValueFile — new storybook/testing path patterns
// =============================================================================
describe("isLowSignalValueFile — new storybook/ssr-testing path patterns", () => {
  // .storybook/ config (dataset ids 46-47)
  it("identifies docs/.storybook/storybook.css as low-signal", () => {
    expect(isLowSignalValueFile("docs/.storybook/storybook.css")).toBe(true);
  });
  it("identifies docs/.storybook/theme.js as low-signal", () => {
    expect(isLowSignalValueFile("docs/.storybook/theme.js")).toBe(true);
  });
  it("identifies .storybook/preview.ts as low-signal", () => {
    expect(isLowSignalValueFile(".storybook/preview.ts")).toBe(true);
  });

  // apps/storybook/ — REMOVED (convention-specific, redundant with /.storybook/ + *.stories.*;
  // dataset ids 83-85 = residual FP)
  it("does NOT mark apps/storybook/stories/external-overlay.tsx as low-signal (residual FP, ids 83-85)", () => {
    expect(isLowSignalValueFile("apps/storybook/stories/external-overlay.tsx")).toBe(false);
  });
  it("does NOT mark apps/storybook/src/comp.tsx as low-signal (residual FP, ids 83-85)", () => {
    expect(isLowSignalValueFile("apps/storybook/src/comp.tsx")).toBe(false);
  });

  // apps/ssr-testing/ — REMOVED (Mantine-repo-specific; dataset id 82 = residual FP)
  it("does NOT mark apps/ssr-testing/app/comp.tsx as low-signal (residual FP, id 82)", () => {
    expect(isLowSignalValueFile("apps/ssr-testing/app/comp.tsx")).toBe(false);
  });

  // Recall guards — must NOT suppress
  it("does NOT mark src/Button.tsx as low-signal", () => {
    expect(isLowSignalValueFile("src/Button.tsx")).toBe(false);
  });
  it("does NOT mark src/button.module.css as low-signal", () => {
    expect(isLowSignalValueFile("src/button.module.css")).toBe(false);
  });
  it("does NOT mark apps/v4/components/Button.tsx as low-signal (not storybook)", () => {
    expect(isLowSignalValueFile("apps/v4/components/Button.tsx")).toBe(false);
  });
});

describe("story-test rule integration — must NOT flag", () => {
  it("does NOT flag hex in docs/.storybook/storybook.css (dataset id 46)", async () => {
    const parsed = cssFile(
      "docs/.storybook/storybook.css",
      `.sbdocs-wrapper { outline-color: #0070f3; background: #fff; }`,
    );
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag hex in .storybook/theme.js (dataset id 47)", async () => {
    const parsed = tsFile(
      "docs/.storybook/theme.js",
      `export default { brandColor: "#ff6154", brandImage: undefined };`,
    );
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  // apps/storybook/ — RESIDUAL FP (ids 83-85): no longer suppressed after removing
  // the convention-specific path segment. Still documented here as a known residual.
  it("RESIDUAL FP: flags hex in apps/storybook/stories/external-overlay.tsx (dataset ids 83-85 — residual)", async () => {
    // primitives — Storybook story fixture; no longer suppressed (accepted residual)
    const parsed = tsFile(
      "apps/storybook/stories/external-overlay.tsx",
      `export const WithOverlay = () => (
  <div style={{ background: "#f5f5f5", color: "#333", border: "1px solid #ccc" }} />
);`,
    );
    const result = await rule.evaluate(ctx, parsed);
    // No longer suppressed — accepted residual FP (apps/storybook/ was convention-specific)
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
  });

  // apps/ssr-testing/ — RESIDUAL FP (id 82): no longer suppressed after removing
  // the Mantine-specific path segment. Still documented here as a known residual.
  it("RESIDUAL FP: flags hex in apps/ssr-testing/app/comp.tsx (dataset id 82 — residual)", async () => {
    const parsed = tsFile(
      "apps/ssr-testing/app/roving-focus-group/roving-focus.client.tsx",
      `const style = { backgroundColor: "#eee", color: "#222" };`,
    );
    const result = await rule.evaluate(ctx, parsed);
    // No longer suppressed — accepted residual FP (ssr-testing is Mantine-specific)
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
  });
});

describe("story-test recall — real component colors MUST still flag", () => {
  it("flags hex in apps/v4/components/Button.tsx (not storybook)", async () => {
    const parsed = tsFile(
      "apps/v4/components/Button.tsx",
      `export const Button = () => <div style={{ color: "#ff0000" }} />;`,
    );
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(1);
  });

  it("flags hex in src/components/Card.css (not storybook)", async () => {
    const parsed = cssFile(
      "src/components/Card.css",
      `.card { background: rgba(255,255,255,0.5); }`,
    );
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// SVG-ICON: isSvgIconContext — path helper unit tests
// =============================================================================
describe("isSvgIconContext — path helper unit tests", () => {
  // *Icon.{tsx,jsx,ts,js,svg} basename (dataset ids 17-18, 45)
  it("identifies ViteIcon.tsx as svg-icon context", () => {
    expect(isSvgIconContext("apps/mantine.dev/src/components/icons/ViteIcon.tsx")).toBe(true);
  });
  it("identifies CssIcon.tsx as svg-icon context", () => {
    expect(isSvgIconContext("packages/@mantinex/dev-icons/src/CssIcon.tsx")).toBe(true);
  });
  it("identifies SearchIcon.jsx as svg-icon context", () => {
    expect(isSvgIconContext("src/components/SearchIcon.jsx")).toBe(true);
  });
  it("identifies icon.svg file as svg-icon context", () => {
    expect(isSvgIconContext("src/assets/arrow.svg")).toBe(true);
  });
  it("identifies file in /icons/ directory as svg-icon context", () => {
    expect(isSvgIconContext("src/icons/close.tsx")).toBe(true);
  });
  it("identifies file in /icon/ directory as svg-icon context", () => {
    expect(isSvgIconContext("src/icon/logo.tsx")).toBe(true);
  });
  it("identifies file in /svg/ directory as svg-icon context", () => {
    expect(isSvgIconContext("src/svg/arrow.tsx")).toBe(true);
  });

  // Recall guards — real component files must NOT be suppressed
  it("does NOT suppress src/Button.tsx (real component)", () => {
    expect(isSvgIconContext("src/Button.tsx")).toBe(false);
  });
  it("does NOT suppress src/components/Button.css (component stylesheet)", () => {
    expect(isSvgIconContext("src/components/Button.css")).toBe(false);
  });
  it("does NOT suppress apps/v4/app/create/components/card.tsx (not an icon)", () => {
    expect(isSvgIconContext("apps/v4/app/create/components/card.tsx")).toBe(false);
  });
});

describe("isSvgIconContext — path-only (content signal removed)", () => {
  // Content signal was removed to close a recall hole (mixed SVG + real DS colors).
  // dataset id 86 (icon-library-picker.tsx) is now a RESIDUAL FP.

  // *Icon.tsx basename still matches via path
  it("still identifies fill='#fff' in SomeIcon.tsx via path signal", () => {
    const src = `<path d="M10 20" fill="#fff" stroke="none" />`;
    expect(isSvgIconContext("src/SomeIcon.tsx")).toBe(true);
  });
  it("still identifies DiagramIcon.tsx via path signal (Icon suffix)", () => {
    expect(isSvgIconContext("src/DiagramIcon.tsx")).toBe(true);
  });

  // Non-icon-path files with fill= content are now NOT suppressed (content signal gone)
  it("does NOT suppress src/Logo.tsx (no Icon suffix, no icon path) — content signal removed", () => {
    expect(isSvgIconContext("src/Logo.tsx")).toBe(false);
  });
  it("does NOT suppress a component CSS file even with SVG-like content", () => {
    expect(isSvgIconContext("src/components/Button.css")).toBe(false);
  });
  it("does NOT suppress a regular component with inline SVG used decoratively", () => {
    // A component file that is NOT an icon file — must NOT be suppressed (path-only check)
    expect(isSvgIconContext("src/components/Banner.tsx")).toBe(false);
  });
});

describe("svg-icon rule integration — must NOT flag", () => {
  it("does NOT flag fill='#fff' in ViteIcon.tsx (dataset id 17-18)", async () => {
    // ViteIcon component — pure SVG artwork, not DS usage
    const parsed = tsFile(
      "apps/mantine.dev/src/components/icons/ViteIcon.tsx",
      `export function ViteIcon() {
  return (
    <svg viewBox="0 0 32 32">
      <path d="M29.884..." fill="#fff" />
      <path d="M29.884..." fill="#ffd62e" />
    </svg>
  );
}`,
    );
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag fill='#fff' in CssIcon.tsx (dataset id 45)", async () => {
    const parsed = tsFile(
      "packages/@mantinex/dev-icons/src/CssIcon.tsx",
      `export function CssIcon() {
  return <svg><path d="M..." fill="#fff" /></svg>;
}`,
    );
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT flag hex in .svg file (pure SVG asset)", async () => {
    const parsed = tsFile(
      "src/assets/icons/arrow.svg",
      `<svg xmlns="http://www.w3.org/2000/svg"><path fill="#000000" d="M10 20z"/></svg>`,
    );
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(0);
  });

  // icon-library-picker.tsx — RESIDUAL FP (id 86): no icon-path signal; content signal removed
  it("RESIDUAL FP: flags fill='#fff' in icon-library-picker.tsx (dataset id 86 — residual)", async () => {
    // apps/v4/app/(app)/create/components/icon-library-picker.tsx — icon picker UI
    // NOT named *Icon.tsx and not in /icons/ dir — no path signal; content signal removed.
    // Accepted residual FP: recall safety (mixed-file hole) outweighs this suppression.
    const parsed = tsFile(
      "apps/v4/app/create/components/icon-library-picker.tsx",
      `export function IconPicker() {
  return icons.map(icon => (
    <svg key={icon.id} viewBox="0 0 24 24">
      <path d={icon.d} fill="#fff" />
    </svg>
  ));
}`,
    );
    const result = await rule.evaluate(ctx, parsed);
    // No longer suppressed — accepted residual FP
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
  });
});

describe("svg-icon recall — real component colors MUST still flag", () => {
  it("flags hex in src/components/Button.css (real component — not svg-icon)", async () => {
    const parsed = cssFile(
      "src/components/Button.css",
      `.btn { background: #2563eb; }`,
    );
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(1);
  });

  it("flags hex in a component that decoratively embeds an <svg> (not an icon file)", async () => {
    // Banner.tsx is NOT an icon — it uses a decorative <svg> inline
    // The color applied to the div, not the SVG, should still flag
    const parsed = tsFile(
      "src/components/Banner.tsx",
      `export const Banner = () => (
  <div style={{ background: "#ff0000" }}>
    <svg width="16" height="16"><circle cx="8" cy="8" r="8" /></svg>
  </div>
);`,
    );
    const result = await rule.evaluate(ctx, parsed);
    // #ff0000 on the div must still flag
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
    expect(result.findings.some((f) => f.message.includes("#ff0000"))).toBe(true);
  });

  it("flags fill= in a regular component that isn't SVG art", async () => {
    // A component CSS file with fill property (e.g. for a chart) — not an icon file
    const parsed = cssFile(
      "src/components/chart.module.css",
      `.bar { fill: #2563eb; }`,
    );
    const result = await rule.evaluate(ctx, parsed);
    expect(result.findings).toHaveLength(1);
  });
});

// =============================================================================
// MIXED-FILE RECALL (Fix 2 guard): inline <svg> + real hardcoded color
// =============================================================================
describe("mixed-file recall — inline SVG must not suppress real DS color findings", () => {
  it("flags background:#2563eb in ColorPicker.tsx even when file contains <svg fill=#e53e3e>", async () => {
    // Recall hole closed by removing the content-based SVG suppression.
    // This file has an inline decorative <svg><path fill="#e53e3e"/></svg>
    // AND a real hardcoded color on a styled block — the DS color must still flag.
    const parsed = tsFile(
      "src/components/ColorPicker.tsx",
      `export function ColorPicker() {
  return (
    <div>
      <svg viewBox="0 0 16 16"><path d="M0 0h16v16H0z" fill="#e53e3e" /></svg>
      <div style={{ background: "#2563eb" }}>Pick a color</div>
    </div>
  );
}`,
    );
    const result = await rule.evaluate(ctx, parsed);
    // #2563eb on the non-SVG div MUST still flag
    expect(result.findings.some((f) => f.message.includes("#2563eb"))).toBe(true);
  });
});
