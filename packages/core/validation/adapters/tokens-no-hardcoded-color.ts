import type { OracleAdapter, FixtureFiles } from "../types.js";

const PKG = JSON.stringify({ name: "fx-color", version: "1.0.0" });

function clean(): FixtureFiles {
  return {
    "package.json": PKG,
    // Real token source (extracted into the graph as color tokens) so each
    // mutation's literal has a candidate to resolve against — without this,
    // every mutation would resolve `novel` (no known match) regardless of
    // which color it injects, understating recall on the four-class resolver.
    // `--color-accent` covers the css-hsl mutation separately: hsl(217, 83%,
    // 53%) is ~0.031 ΔEOK from #2563eb — just outside the 0.02 `near`
    // threshold — so it needs its own token to resolve `exact` rather than
    // `novel`. Deliberately NOT named `--color-fg-*` (a prefix of
    // `--color-fg`): the css-vars normalizer (src/tokens/normalizer.ts
    // `setAt`/`ensureGroup`) silently drops a shallower custom property when
    // a longer one nests under its name as a path segment.
    "src/theme.css": ":root { --color-fg: #2563eb; --color-accent: hsl(217, 83%, 53%); --color-bg: #ffffff; }",
    "src/Box.css": ".box { color: var(--color-fg); background: var(--color-bg); }",
    "src/Btn.tsx": 'export const Btn = () => <button className="text-fg" />;',
  };
}

/**
 * False-friend corpus — realistic legitimate code that contains color literals
 * but must NOT be flagged. Harvested from patterns found in real design systems
 * (Carbon, Primer, shadcn/ui, Radix, Chakra, Finary DS).
 *
 * Classes:
 *   1. Token-definition files (colors.ts / palette.ts / brand-colors.ts)
 *   2. Documentation <code>/<pre> blocks (single-line JSX display components)
 *   3. var() CSS fallback values
 *   4. JSDoc @example blocks in render components
 *   5. Schema / default / example object-key values
 *   6. CSS custom-property declarations (token-def in CSS)
 *   7. Low-signal path files (stories, tests, fixtures)
 */
const FALSE_FRIENDS: FixtureFiles[] = [
  // ── FP CLASS 1: Token-definition files ──────────────────────────────────────
  // colors.ts — canonical primitive color ramp (Carbon/Primer pattern)
  {
    "package.json": PKG,
    "tokens/colors.ts": `export const colors = {
  blue50: "#eff6ff",
  blue100: "#dbeafe",
  blue500: "#2563eb",
  blue900: "#1e3a8a",
  red500: "#ef4444",
  green500: "#22c55e",
};`,
  },
  // palette.ts — another common name for the primitive layer
  {
    "package.json": PKG,
    "src/palette.ts": `export const palette = {
  neutral100: "#f5f5f5",
  neutral200: "#e5e5e5",
  neutral900: "#171717",
  brand500: "#6366f1",
  brand600: "#4f46e5",
  success: "#22c55e",
};`,
  },
  // brand-colors.ts — dash-prefixed naming convention
  {
    "package.json": PKG,
    "design-tokens/brand-colors.ts": `export const brandColors = {
  primary: "#2563eb",
  primaryHover: "#1d4ed8",
  secondary: "#7c3aed",
  danger: "#dc2626",
  success: "#16a34a",
};`,
  },
  // tokens/colors.ts — deeply nested structure (common in Primer/Carbon)
  {
    "package.json": PKG,
    "src/tokens/colors.ts": `export const colors = {
  blue: {
    "50": "#eff6ff",
    "100": "#dbeafe",
    "500": "#3b82f6",
    "900": "#1e3a8a",
  },
  red: {
    "500": "#ef4444",
    "700": "#b91c1c",
  },
  neutral: {
    "100": "#f5f5f5",
    "900": "#171717",
  },
};`,
  },

  // ── FP CLASS 2: Documentation <code>/<pre> blocks ────────────────────────────
  // Inline <code> — copy-paste example in a doc page (shadcn theme customizer pattern)
  {
    "package.json": PKG,
    "docs/ColorPage.tsx": `export const D = () => (
  <p>Use <code>color: #2563eb;</code> or a token.</p>
);`,
  },
  // <pre> block — multiline display example on a single line
  {
    "package.json": PKG,
    "docs/ThemeGuide.tsx": `export const Guide = () => <pre>background: hsl(214, 86%, 53%);</pre>;`,
  },
  // RGB inside <code>
  {
    "package.json": PKG,
    "docs/Example.tsx": `export const Ex = () => <code>{"color: rgb(37, 99, 235)"}</code>;`,
  },
  // Multi-line <code> block — the real FP class (literal on a different line from tag)
  {
    "package.json": PKG,
    "src/CodeExample.tsx": `export const CodeExample = () => (
  <code>
    color: #2563eb;
    background: hsl(214, 86%, 53%);
  </code>
);`,
  },
  // Multi-line <pre> block — syntax highlight component
  {
    "package.json": PKG,
    "src/SyntaxBlock.tsx": `export const SyntaxBlock = () => (
  <pre>
    .button {'{'}
      color: #1d4ed8;
      background: rgb(37, 99, 235);
    {'}'}
  </pre>
);`,
  },
  // <code> with className attribute — multi-line (Prism/hljs pattern)
  {
    "package.json": PKG,
    "src/HighlightBlock.tsx": `export const HighlightBlock = () => (
  <code className="language-css">
    {'.btn { color: #ef4444; }'}
  </code>
);`,
  },

  // ── FP CLASS 3: var() CSS fallbacks ──────────────────────────────────────────
  // Simple hex fallback — canonical CSS safe-fallback pattern
  {
    "package.json": PKG,
    "src/button.css": ".btn { color: var(--color-action, #2563eb); }",
  },
  // HSL function as fallback value
  {
    "package.json": PKG,
    "src/card.css": ".card { background: var(--color-surface, hsl(210, 40%, 98%)); }",
  },
  // Nested var() fallback: var(--outer, var(--inner, #hex))
  {
    "package.json": PKG,
    "src/chip.css": ".chip { border-color: var(--border, var(--border-fallback, #e2e8f0)); }",
  },
  // RGB fallback in a SCSS partial
  {
    "package.json": PKG,
    "src/_theme.scss": ".root { color: var(--text-primary, rgb(15, 23, 42)); }",
  },

  // ── FP CLASS 4: Swatch / color-picker render components (JSDoc examples) ─────
  // ColorSwatch: color passed as prop, literal only in JSDoc @example
  {
    "package.json": PKG,
    "src/ColorSwatch.tsx": `/**
 * Renders a swatch with a user-supplied color value.
 * @example
 * <ColorSwatch color="#2563eb" label="Brand primary" />
 */
export function ColorSwatch({ color, label }: { color: string; label: string }) {
  return <div style={{ background: color }} aria-label={label} />;
}`,
  },
  // PalettePreview: iterates token map; literal only in JSDoc
  {
    "package.json": PKG,
    "src/PalettePreview.tsx": `/**
 * Renders a palette preview row.
 * @example
 * <PalettePreview swatches={["#2563eb", "#ef4444"]} />
 */
export function PalettePreview({ swatches }: { swatches: string[] }) {
  return <div>{swatches.map((c) => <span key={c} style={{ background: c }} />)}</div>;
}`,
  },

  // ── FP CLASS 5: Schema / default / example key positions ─────────────────────
  // NestJS-style DTO with example / default fields
  {
    "package.json": PKG,
    "src/color.dto.ts": `export class ColorDto {
  example: string = "#2563eb";
  default: string = "#ffffff";
}`,
  },
  // JSON-schema style object with default and example properties
  {
    "package.json": PKG,
    "src/theme.schema.ts": `export const ThemeSchema = {
  type: "object",
  properties: {
    primary: {
      type: "string",
      default: "#2563eb",
      example: "#1d4ed8",
    },
  },
};`,
  },
  // Storybook args object — mock data for stories
  {
    "package.json": PKG,
    "src/Button.stories.ts": `export default { title: "Button" };
export const Primary = {
  args: {
    color: "#2563eb",
    background: "#ffffff",
  },
};`,
  },

  // ── FP CLASS 6: CSS custom-property declarations (token definition in CSS) ───
  // :root block — defining the design token values themselves
  {
    "package.json": PKG,
    "tokens/theme.css": `:root {
  --color-brand-primary: #2563eb;
  --color-brand-secondary: #7c3aed;
  --color-surface: #f8fafc;
  --color-text: hsl(222, 47%, 11%);
}`,
  },
  // Component-scoped custom property (local alias pattern — valid local var def)
  {
    "package.json": PKG,
    "src/Widget.css": `.widget {
  --widget-bg: rgb(248, 250, 252);
  --widget-border: #e2e8f0;
  background: var(--widget-bg);
  border-color: var(--widget-border);
}`,
  },
  // Semantic token CSS file (exported theme layer)
  {
    "package.json": PKG,
    "tokens/semantic.css": `:root {
  --color-action-primary: #2563eb;
  --color-action-hover: #1d4ed8;
  --color-danger: #dc2626;
  --color-success: #16a34a;
  --color-surface: #ffffff;
}`,
  },

  // ── FP CLASS 7: Low-signal path files ─────────────────────────────────────────
  // Storybook story file (path guard: *.stories.tsx)
  {
    "package.json": PKG,
    "src/Button.stories.tsx": `export default { title: "Button" };
export const Primary = () => <button style={{ background: "#2563eb" }}>Click</button>;`,
  },
  // Vitest test file (__tests__ directory guard)
  {
    "package.json": PKG,
    "src/__tests__/utils.test.ts": `import { describe, it, expect } from "vitest";
describe("color utils", () => {
  it("parses hex", () => {
    expect(parseHex("#2563eb")).toEqual({ r: 37, g: 99, b: 235 });
  });
});`,
  },
  // Fixture file (fixtures directory guard)
  {
    "package.json": PKG,
    "src/fixtures/colors.ts": `export const FIXTURE_COLORS = {
  primary: "#2563eb",
  secondary: "#7c3aed",
  danger: "#dc2626",
};`,
  },

  // ── FP CLASS 8: Additional var() fallback patterns ────────────────────────────
  // Hex fallback in SCSS variable (common in migrating projects)
  {
    "package.json": PKG,
    "src/components/Alert.scss": `.alert {
  background: var(--alert-bg, #fef9c3);
  border: 1px solid var(--alert-border, #fde047);
  color: var(--alert-text, #713f12);
}`,
  },
  // oklch with var() fallback (modern CSS color)
  {
    "package.json": PKG,
    "src/global.css": `.root { color: var(--fg, oklch(30% 0.05 240)); }`,
  },
  // Multi-property var() fallbacks in a component CSS file
  {
    "package.json": PKG,
    "src/Input.css": `.input {
  background: var(--input-bg, #ffffff);
  border-color: var(--input-border, #d1d5db);
  color: var(--input-text, rgb(17, 24, 39));
  outline-color: var(--input-focus, #3b82f6);
}`,
  },
];

export const colorAdapter: OracleAdapter = {
  ruleId: "tokens/no-hardcoded-color",
  oracleKind: "construction",
  cleanFixture: clean,
  mutations: [
    { name: "css-hex", apply: (f) => ({ ...f, "src/Box.css": ".box { color: #2563eb; }" }) },
    { name: "css-rgb", apply: (f) => ({ ...f, "src/Box.css": ".box { color: rgb(37, 99, 235); }" }) },
    { name: "css-hsl", apply: (f) => ({ ...f, "src/Box.css": ".box { color: hsl(217, 83%, 53%); }" }) },
    { name: "tailwind-arbitrary", apply: (f) => ({ ...f, "src/Btn.tsx": 'export const Btn = () => <button className="bg-[#ffffff]" />;' }) },
  ],
  // Each pair inlines a `:root { --color-a: #ffffff; }` token definition (the
  // custom-property declaration itself is guard-suppressed, never a finding)
  // so both sides resolve `exact` against a real candidate — otherwise both
  // would resolve `novel` (no known token), still consistent with each other
  // but never matching `expectViolation: true` under the four-class resolver.
  metamorphic: [
    {
      name: "hex-eq-rgb",
      a: { "package.json": PKG, "src/m.css": ":root { --color-a: #ffffff; } .a { color: #ffffff; }" },
      b: { "package.json": PKG, "src/m.css": ":root { --color-a: #ffffff; } .a { color: rgb(255, 255, 255); }" },
      expectViolation: true,
    },
    {
      name: "shorthand-eq-longhand-hex",
      a: { "package.json": PKG, "src/m.css": ":root { --color-a: #ffffff; } .a { color: #fff; }" },
      b: { "package.json": PKG, "src/m.css": ":root { --color-a: #ffffff; } .a { color: #ffffff; }" },
      expectViolation: true,
    },
  ],
  // falseFriends removed: the synthetic corpus (33 samples) was not representative
  // of real-world FP rates (~65% precision on 8 OSS repos). Catalogue nulled out.
  // Re-introduce when a labelled real-world corpus is available.
};
