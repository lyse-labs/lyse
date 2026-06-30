import type { OracleAdapter, FixtureFiles } from "../types.js";

const PKG = JSON.stringify({ name: "fx-shadow", version: "1.0.0" });

function clean(): FixtureFiles {
  return {
    "package.json": PKG,
    "src/Card.css": ".card { box-shadow: var(--shadow-md); }",
  };
}

/**
 * False-friend corpus — realistic legitimate code that contains box-shadow
 * literals but must NOT be flagged. Modelled on patterns found in real design
 * systems (Carbon, Primer, shadcn/ui, Radix, Chakra, Material).
 *
 * Classes:
 *   1. Token-definition files (elevation.ts / shadow-tokens.ts)
 *   2. CSS custom-property declarations (:root { --shadow-sm: ... })
 *   3. var() references (tokenized CSS usage)
 *   4. Keyword values: none, inherit, unset
 *   5. CSS comments and doc blocks
 *   6. var() with box-shadow fallback
 *   7. Low-signal path files (stories, tests, fixtures)
 *   8. Schema / default / example object-key positions
 *   9. CSS-in-JS token-definition objects
 *  10. JSDoc @example blocks in shadow-rendering components
 */
const FALSE_FRIENDS: FixtureFiles[] = [
  // ── FP CLASS 1: Token-definition TS files ───────────────────────────────────
  // elevation.ts — canonical shadow scale (Carbon / Material pattern)
  {
    "package.json": PKG,
    "tokens/elevation.ts": `export const elevation = {
  sm: "0 1px 2px rgba(0,0,0,0.1)",
  md: "0 4px 8px rgba(0,0,0,0.12)",
  lg: "0 8px 24px rgba(0,0,0,0.14)",
  xl: "0 16px 48px rgba(0,0,0,0.16)",
};`,
  },
  // shadow-tokens.ts — alternative naming
  {
    "package.json": PKG,
    "src/tokens/shadow-tokens.ts": `export const shadows = {
  none: "none",
  sm: "0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)",
  md: "0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)",
  lg: "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)",
};`,
  },
  // shadows.ts — plain name (Primer / Tailwind pattern)
  {
    "package.json": PKG,
    "design-tokens/shadows.ts": `export const shadowScale = {
  inner: "inset 0 2px 4px rgba(0,0,0,0.06)",
  base: "0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)",
  focus: "0 0 0 3px rgba(59,130,246,0.5)",
};`,
  },

  // ── FP CLASS 2: CSS custom-property declarations (token def in CSS) ──────────
  // :root block defining shadow tokens
  {
    "package.json": PKG,
    "tokens/elevation.css": `:root {
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.1);
  --shadow-md: 0 4px 8px rgba(0,0,0,0.12);
  --shadow-lg: 0 10px 24px rgba(0,0,0,0.14);
}`,
  },
  // Theme CSS with elevation custom properties
  {
    "package.json": PKG,
    "src/theme.css": `:root {
  --color-brand: #2563eb;
  --elevation-1: 0 1px 2px rgba(0,0,0,0.08);
  --elevation-2: 0 2px 8px rgba(0,0,0,0.12);
  --elevation-3: 0 4px 16px rgba(0,0,0,0.16);
}`,
  },
  // Component-scoped custom property — local alias pattern
  {
    "package.json": PKG,
    "src/Popover.css": `.popover {
  --popover-shadow: 0 8px 16px rgba(0,0,0,0.15);
  box-shadow: var(--popover-shadow);
}`,
  },

  // ── FP CLASS 3: var() references (tokenized CSS usage) ───────────────────────
  // Simple var() reference
  {
    "package.json": PKG,
    "src/Card.css": ".card { box-shadow: var(--shadow-sm); }",
  },
  // Chained var() — semantic alias
  {
    "package.json": PKG,
    "src/Modal.css": ".modal { box-shadow: var(--elevation-3); }",
  },
  // var() in CSS-in-JS
  {
    "package.json": PKG,
    "src/Button.tsx": `export const Button = () => (
  <button style={{ boxShadow: "var(--shadow-sm)" }}>click</button>
);`,
  },

  // ── FP CLASS 4: Keyword values ────────────────────────────────────────────────
  // none — explicit reset
  {
    "package.json": PKG,
    "src/flat.css": `.flat { box-shadow: none; }`,
  },
  // inherit
  {
    "package.json": PKG,
    "src/inherit.css": `.wrapper > .inner { box-shadow: inherit; }`,
  },
  // unset
  {
    "package.json": PKG,
    "src/reset.css": `.reset { box-shadow: unset; }`,
  },
  // initial
  {
    "package.json": PKG,
    "src/initial.css": `.clear { box-shadow: initial; }`,
  },
  // revert
  {
    "package.json": PKG,
    "src/revert.css": `.revert { box-shadow: revert; }`,
  },

  // ── FP CLASS 5: CSS comments and doc blocks ───────────────────────────────────
  // Single-line comment in CSS
  {
    "package.json": PKG,
    "src/shadows.css": `/* box-shadow: 0 2px 4px rgba(0,0,0,0.3) — legacy, replaced by tokens */
.card { box-shadow: var(--shadow-md); }`,
  },
  // Multi-line comment
  {
    "package.json": PKG,
    "docs/tokens.css": `/*
 * Elevation scale:
 *   --shadow-sm: 0 1px 3px rgba(0,0,0,0.1)
 *   --shadow-md: 0 4px 8px rgba(0,0,0,0.12)
 */
:root { --shadow-sm: 0 1px 3px rgba(0,0,0,0.1); }`,
  },

  // ── FP CLASS 6: var() with box-shadow fallback ────────────────────────────────
  // Single-level var() fallback
  {
    "package.json": PKG,
    "src/card.css": `.card { box-shadow: var(--shadow-md, 0 4px 8px rgba(0,0,0,0.12)); }`,
  },
  // Nested var() fallback: var(--outer, var(--inner, literal))
  {
    "package.json": PKG,
    "src/chip.css": `.chip { box-shadow: var(--chip-shadow, var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.1))); }`,
  },
  // Focus ring with var() fallback
  {
    "package.json": PKG,
    "src/Input.css": `.input:focus { box-shadow: var(--focus-ring, 0 0 0 3px rgba(59,130,246,0.5)); }`,
  },

  // ── FP CLASS 7: Low-signal path files ─────────────────────────────────────────
  // Storybook story file
  {
    "package.json": PKG,
    "src/Card.stories.tsx": `export default { title: "Card" };
export const Elevated = () => (
  <div style={{ boxShadow: "0 4px 8px rgba(0,0,0,0.2)" }}>card</div>
);`,
  },
  // Vitest test file
  {
    "package.json": PKG,
    "src/__tests__/shadow-utils.test.ts": `import { describe, it, expect } from "vitest";
describe("shadow util", () => {
  it("serializes shadow", () => {
    expect(serializeShadow({ blur: 4, color: "rgba(0,0,0,0.1)" })).toBe("0 2px 4px rgba(0,0,0,0.1)");
  });
});`,
  },
  // Fixture file
  {
    "package.json": PKG,
    "src/fixtures/shadow-data.ts": `export const SHADOW_FIXTURES = {
  sm: "0 1px 2px rgba(0,0,0,0.1)",
  md: "0 4px 8px rgba(0,0,0,0.12)",
};`,
  },

  // ── FP CLASS 8: Schema / default / example object-key positions ──────────────
  // NestJS-style DTO with example field
  {
    "package.json": PKG,
    "src/shadow.dto.ts": `export class ShadowDto {
  example: string = "0 2px 4px rgba(0,0,0,0.1)";
  default: string = "none";
}`,
  },
  // JSON-schema style object with default and example properties
  {
    "package.json": PKG,
    "src/shadow.schema.ts": `export const ShadowSchema = {
  type: "string",
  default: "none",
  example: "0 1px 3px rgba(0,0,0,0.1)",
};`,
  },
  // Storybook args — mock data
  {
    "package.json": PKG,
    "src/Box.stories.ts": `export default { title: "Box" };
export const WithShadow = {
  args: {
    shadow: "0 2px 4px rgba(0,0,0,0.1)",
    noShadow: "none",
  },
};`,
  },

  // ── FP CLASS 9: CSS-in-JS token-definition objects ────────────────────────────
  // Stitches/Vanilla-extract style token object
  {
    "package.json": PKG,
    "src/tokens.ts": `export const tokens = {
  shadow: {
    sm: "0 1px 3px rgba(0,0,0,0.1)",
    md: "0 4px 6px -1px rgba(0,0,0,0.1)",
    lg: "0 10px 15px -3px rgba(0,0,0,0.1)",
    none: "none",
  },
};`,
  },
  // Theme object in a design-system package root
  {
    "package.json": PKG,
    "src/theme.ts": `export const theme = {
  colors: { brand: "#2563eb" },
  shadows: {
    sm: "0 1px 2px rgba(0,0,0,0.05)",
    md: "0 4px 8px rgba(0,0,0,0.1)",
    focus: "0 0 0 2px rgba(59,130,246,0.5)",
  },
};`,
  },

  // ── FP CLASS 10: JSDoc @example blocks ───────────────────────────────────────
  // ShadowSwatch component — literal only in @example
  {
    "package.json": PKG,
    "src/ShadowSwatch.tsx": `/**
 * Renders a preview of a box-shadow value.
 * @example
 * <ShadowSwatch shadow="0 2px 4px rgba(0,0,0,0.1)" label="Small" />
 */
export function ShadowSwatch({ shadow, label }: { shadow: string; label: string }) {
  return <div style={{ boxShadow: shadow }} aria-label={label} />;
}`,
  },
  // ElevationPreview — iterates token map; literal only in JSDoc
  {
    "package.json": PKG,
    "src/ElevationPreview.tsx": `/**
 * Shows the elevation scale.
 * @example
 * <ElevationPreview levels={["0 1px 2px rgba(0,0,0,0.1)", "0 4px 8px rgba(0,0,0,0.12)"]} />
 */
export function ElevationPreview({ levels }: { levels: string[] }) {
  return <div>{levels.map((s) => <div key={s} style={{ boxShadow: s }} />)}</div>;
}`,
  },
  // SCSS variable — $shadow-sm: value; (SCSS variable definition, token source of truth)
  {
    "package.json": PKG,
    "tokens/_shadows.scss": `$shadow-sm: 0 1px 3px rgba(0,0,0,0.1);
$shadow-md: 0 4px 8px rgba(0,0,0,0.12);
$shadow-lg: 0 10px 24px rgba(0,0,0,0.14);`,
  },
];

export const shadowAdapter: OracleAdapter = {
  ruleId: "tokens/no-hardcoded-shadow",
  oracleKind: "construction",
  cleanFixture: clean,
  mutations: [
    { name: "literal", apply: (f) => ({ ...f, "src/x.css": ".a { box-shadow: 0 2px 4px rgba(0,0,0,0.1); }" }) },
    { name: "alt-literal", apply: (f) => ({ ...f, "src/x.css": ".a { box-shadow: 0 4px 8px rgba(0,0,0,0.2); }" }) },
    { name: "multi-layer", apply: (f) => ({ ...f, "src/x.css": ".a { box-shadow: 0 2px 4px rgba(0,0,0,0.1), 0 8px 16px rgba(0,0,0,0.15); }" }) },
    { name: "scss-literal", apply: (f) => ({ ...f, "src/x.scss": ".a { box-shadow: 0 2px 8px rgba(0,0,0,0.25); }" }) },
  ],
  metamorphic: [
    {
      name: "two-literal-spellings",
      a: { "package.json": PKG, "src/m.css": ".a { box-shadow: 0 2px 4px rgba(0,0,0,0.1); }" },
      b: { "package.json": PKG, "src/m.css": ".a { box-shadow: 0 4px 8px rgba(0,0,0,0.2); }" },
      expectViolation: true,
    },
  ],
  falseFriends: FALSE_FRIENDS,
};
