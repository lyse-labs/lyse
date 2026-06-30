import { describe, it, expect } from "vitest";
import { ruleFlagged } from "../../validation/audit-probe.js";

const PKG = JSON.stringify({ name: "fx", version: "1.0.0" });

/**
 * False-friend corpus — realistic LEGITIMATE code that contains color literals
 * but must NOT be flagged as drift. These are patterns harvested from real
 * design systems (Carbon, Primer, shadcn, Radix, Chakra, Finary, etc.).
 *
 * Each entry is a FixtureFiles that models one plausible false-positive class.
 */
const FRIENDS: Array<[string, Record<string, string>]> = [
  // ── FP CLASS 1: Token-definition files ──────────────────────────────────────
  // A colors.ts file that IS the source of truth for color values.
  [
    "token-def/colors-ts",
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
  ],
  // A palette.ts file — common name for token-def files.
  [
    "token-def/palette-ts",
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
  ],
  // A brand-colors.ts file — dash-prefixed naming.
  [
    "token-def/brand-colors-ts",
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
  ],

  // ── FP CLASS 2: Documentation <code>/<pre> blocks ───────────────────────────
  // Inline <code> tag — same-line (most common in JSX doc components).
  [
    "doc-code/inline-code-tag",
    {
      "package.json": PKG,
      "docs/ColorPage.tsx": `export const D = () => (
  <p>Use <code>color: #2563eb;</code> or a token.</p>
);`,
    },
  ],
  // <pre> block on a single line.
  [
    "doc-code/inline-pre-tag",
    {
      "package.json": PKG,
      "docs/ThemeGuide.tsx": `export const Guide = () => <pre>background: hsl(214, 86%, 53%);</pre>;`,
    },
  ],
  // <code> with JSX expression.
  [
    "doc-code/code-block-rgb",
    {
      "package.json": PKG,
      "docs/Example.tsx": `export const Ex = () => <code>{"color: rgb(37, 99, 235)"}</code>;`,
    },
  ],
  // Multi-line <code> block — the literal is on a different line from the tag.
  // This is the real FP class: documentation component with multi-line code display.
  [
    "doc-code/multiline-code-block",
    {
      "package.json": PKG,
      "src/CodeExample.tsx": `export const CodeExample = () => (
  <code>
    color: #2563eb;
    background: hsl(214, 86%, 53%);
  </code>
);`,
    },
  ],
  // Multi-line <pre> block — syntax highlight doc component.
  [
    "doc-code/multiline-pre-block",
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
  ],
  // <code> with attributes (className for syntax highlighting) — multi-line.
  [
    "doc-code/code-with-attrs-multiline",
    {
      "package.json": PKG,
      "src/HighlightBlock.tsx": `export const HighlightBlock = () => (
  <code className="language-css">
    {'.btn { color: #ef4444; }'}
  </code>
);`,
    },
  ],

  // ── FP CLASS 3: var() fallbacks in CSS ──────────────────────────────────────
  // Simple hex fallback — the canonical CSS safe-fallback pattern.
  [
    "var-fallback/hex-css",
    {
      "package.json": PKG,
      "src/button.css": ".btn { color: var(--color-action, #2563eb); }",
    },
  ],
  // HSL function as fallback value.
  [
    "var-fallback/hsl-css",
    {
      "package.json": PKG,
      "src/card.css": ".card { background: var(--color-surface, hsl(210, 40%, 98%)); }",
    },
  ],
  // Nested var() fallback: var(--outer, var(--inner, #hex)).
  [
    "var-fallback/nested-var",
    {
      "package.json": PKG,
      "src/chip.css": ".chip { border-color: var(--border, var(--border-fallback, #e2e8f0)); }",
    },
  ],
  // RGB fallback in a SCSS partial.
  [
    "var-fallback/rgb-scss",
    {
      "package.json": PKG,
      "src/_theme.scss": ".root { color: var(--text-primary, rgb(15, 23, 42)); }",
    },
  ],

  // ── FP CLASS 4: Swatch / color-picker render components ────────────────────
  // A ColorSwatch component that renders a box with the user-supplied color prop.
  // The color literal appears only in the JSDoc @example block — not in CSS.
  [
    "swatch/color-picker-jsdoc-example",
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
  ],
  // A palette preview where colors are sourced from the token map at runtime;
  // the literal appears in a JSDoc @example block only.
  [
    "swatch/palette-preview-jsdoc",
    {
      "package.json": PKG,
      "src/PalettePreview.tsx": `/**
 * Renders a swatch row.
 * @example
 * <PalettePreview swatches={["#2563eb", "#ef4444"]} />
 */
export function PalettePreview({ swatches }: { swatches: string[] }) {
  return <div>{swatches.map((c) => <span key={c} style={{ background: c }} />)}</div>;
}`,
    },
  ],

  // ── FP CLASS 5: Schema / default / example value positions ─────────────────
  // A NestJS DTO with an @ApiProperty example value.
  [
    "schema/nestjs-dto",
    {
      "package.json": PKG,
      "src/color.dto.ts": `export class ColorDto {
  example: string = "#2563eb";
  default: string = "#ffffff";
}`,
    },
  ],
  // A JSON-schema type with a default color value in an object literal.
  [
    "schema/ts-schema-default",
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
  ],
  // A mock object used in documentation / Storybook args.
  [
    "schema/mock-args",
    {
      "package.json": PKG,
      "src/Button.stories.ts": `export const Primary = {
  args: {
    color: "#2563eb",
    background: "#ffffff",
  },
};`,
    },
  ],

  // ── FP CLASS 6: CSS custom-property declarations (token definitions in CSS) ─
  // :root { --color-brand: #2563eb } — defining a token, not consuming one.
  [
    "css-custom-prop/root-definition",
    {
      "package.json": PKG,
      "tokens/theme.css": `:root {
  --color-brand-primary: #2563eb;
  --color-brand-secondary: #7c3aed;
  --color-surface: #f8fafc;
  --color-text: hsl(222, 47%, 11%);
}`,
    },
  ],
  // Component-scoped custom property.
  [
    "css-custom-prop/component-scoped",
    {
      "package.json": PKG,
      "src/Widget.css": `.widget {
  --widget-bg: rgb(248, 250, 252);
  --widget-border: #e2e8f0;
  background: var(--widget-bg);
  border-color: var(--widget-border);
}`,
    },
  ],

  // ── FP CLASS 7: Stories / test / fixture files (low-signal path guard) ──────
  // A Storybook story file — already guarded by isLowSignalValueFile.
  [
    "low-signal/storybook-story",
    {
      "package.json": PKG,
      "src/Button.stories.tsx": `export default { title: "Button" };
export const Primary = () => <button style={{ background: "#2563eb" }}>Click</button>;`,
    },
  ],
  // A test fixture file.
  [
    "low-signal/test-file",
    {
      "package.json": PKG,
      "src/__tests__/utils.test.ts": `import { describe, it, expect } from "vitest";
describe("color utils", () => {
  it("parses hex", () => {
    expect(parseHex("#2563eb")).toEqual({ r: 37, g: 99, b: 235 });
  });
});`,
    },
  ],

  // ── FP CLASS 8: Realistic design-token theme files ───────────────────────────
  // A theme file that exports semantic tokens as CSS custom properties.
  // The hex literals ARE the token values — this is the source of truth.
  [
    "token-def/theme-css-file",
    {
      "package.json": PKG,
      "tokens/theme.css": `:root {
  --color-action-primary: #2563eb;
  --color-action-hover: #1d4ed8;
  --color-danger: #dc2626;
  --color-success: #16a34a;
  --color-surface: #ffffff;
}`,
    },
  ],
  // A tokens.ts with deeply nested structure (common in Primer/Carbon).
  [
    "token-def/tokens-ts-nested",
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
  ],
];

describe("color rule — false-friend corpus (must not flag)", () => {
  for (const [name, files] of FRIENDS) {
    it(`does not flag: ${name}`, async () => {
      expect(await ruleFlagged(files, "tokens/no-hardcoded-color")).toBe(false);
    });
  }
});
