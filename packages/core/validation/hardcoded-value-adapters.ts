import type { OracleAdapter, FixtureFiles } from "./types.js";

const PKG = JSON.stringify({ name: "fx-hv", version: "1.0.0" });

export interface HardcodedValueSpec {
  ruleId: string;
  property: string;
  cleanValue: string;
  literalValue: string;
  altLiteralValue: string;
  /**
   * Optional real token-definition CSS, included in every fixture this spec
   * generates. On an axis migrated onto the four-class resolver (see
   * tokens-no-hardcoded-spacing.ts), a fixture with no tokens at all puts the
   * axis on its BUILT-IN FALLBACK scale — and a mutation literal that is a
   * member of that scale then resolves `exact`, i.e. COMPLIANT, so the rule
   * stays silent and the oracle records a false negative. A real
   * (deliberately different) scale is what makes the literal land off-scale.
   * `isCssCustomPropertyDeclaration` already guard-suppresses the declaration
   * itself, so this file never produces a finding of its own.
   *
   * Every numeric axis can use this. A plain `:root { --custom-prop: … }`
   * declaration goes through the graph's CSS-custom-property extraction path
   * (graph/extract/tokens.ts#dtcgDocumentToNodes), which derives the axis from
   * the DTCG `$type` AND the token's own path (`axisFor`) — so
   * `--radius-sm` / `--border-width-thin` / `--breakpoint-md` / `--z-modal` /
   * `--opacity-disabled` each land on their own axis. Name the property with
   * the matching prefix or the token falls through to `spacing`, which is
   * `dimension`'s default target.
   *
   * Tailwind v4 `@theme` blocks (loaders/tokens.ts#fromTailwindV4) reach the
   * same axes via their own prefix table, and did so before that fix.
   */
  tokenSource?: string;
  /**
   * DTCG tokens.json content, routed through loaders/tokens.ts#fromDtcg. Its
   * axis heuristics (`/radius/i`, `/border.?width/i`, `/breakpoint|screen/i`,
   * `/z.?index/i`, `/opacity/i`) are the same ones `tokenSource` now gets, so
   * this is an alternative spelling rather than the only way to reach a
   * non-spacing axis — use it when a fixture should exercise the DTCG loader
   * specifically.
   */
  tokensJson?: Record<string, unknown>;
}

export function makeHardcodedValueAdapter(spec: HardcodedValueSpec): OracleAdapter {
  const css = (value: string): FixtureFiles => ({
    "package.json": PKG,
    ...(spec.tokenSource !== undefined && { "src/tokens.css": spec.tokenSource }),
    ...(spec.tokensJson !== undefined && { "src/tokens.tokens.json": JSON.stringify(spec.tokensJson) }),
    "src/x.css": `.a { ${spec.property}: ${value}; }`,
  });
  return {
    ruleId: spec.ruleId,
    oracleKind: "construction",
    cleanFixture: () => css(spec.cleanValue),
    mutations: [
      { name: "literal", apply: () => css(spec.literalValue) },
      { name: "alt-literal", apply: () => css(spec.altLiteralValue) },
    ],
    metamorphic: [
      {
        name: "two-literal-spellings",
        a: css(spec.literalValue),
        b: css(spec.altLiteralValue),
        expectViolation: true,
      },
    ],
  };
}

export const hardcodedValueAdapters: OracleAdapter[] = [
  // tokens/no-hardcoded-spacing is resolver-migrated (Task 6, the Carbon fix):
  // `exact` (on the scale in use) is COMPLIANT, not drift. With no tokens at
  // all the axis falls back to the built-in Tailwind scale, of which 16 is a
  // member — so both 16px and 1rem (= 16px) resolve `exact` and the rule emits
  // NOTHING (measured: J=0.000, 2 missed). --space-sm/--space-lg (8px, 32px)
  // give the fixture a real scale that 16 sits one step off, so the mutations
  // resolve `near` → warning, which this error/warning-only oracle can see.
  makeHardcodedValueAdapter({
    ruleId: "tokens/no-hardcoded-spacing",
    property: "margin",
    cleanValue: "var(--space-md)",
    literalValue: "16px",
    altLiteralValue: "1rem",
    tokenSource: ":root { --space-sm: 8px; --space-lg: 32px; }",
  }),
  // radii/z-index/opacity/border-width are also resolver-migrated (Task 7),
  // and equally need a real (different) scale so mutations land `near`
  // (warning) rather than `exact` (compliant, empty scale) or `novel` at
  // `info` severity (this oracle only counts error/warning as a flag — see
  // validation/audit-probe.ts#ruleFlagged). `tokensJson`, not `tokenSource`:
  // see HardcodedValueSpec's doc above for why a plain CSS custom property
  // can't reach these axes.
  makeHardcodedValueAdapter({
    ruleId: "tokens/no-hardcoded-border-radius",
    property: "border-radius",
    cleanValue: "var(--radius-md)",
    literalValue: "8px",
    altLiteralValue: "0.5rem",
    tokensJson: { radius: { sm: { $value: "4px", $type: "dimension" }, lg: { $value: "16px", $type: "dimension" } } },
  }),
  makeHardcodedValueAdapter({
    ruleId: "tokens/no-hardcoded-z-index",
    property: "z-index",
    cleanValue: "var(--z-modal)",
    literalValue: "100",
    altLiteralValue: "999",
    tokensJson: { zIndex: { dropdown: { $value: "10", $type: "number" }, modal: { $value: "1000", $type: "number" } } },
  }),
  makeHardcodedValueAdapter({
    ruleId: "tokens/no-hardcoded-opacity",
    property: "opacity",
    cleanValue: "var(--opacity-muted)",
    literalValue: "0.5",
    altLiteralValue: ".5",
    tokensJson: { opacity: { muted: { $value: "0.4", $type: "number" }, hover: { $value: "0.9", $type: "number" } } },
  }),
  makeHardcodedValueAdapter({
    ruleId: "tokens/no-hardcoded-border-width",
    property: "border-width",
    cleanValue: "var(--border-md)",
    literalValue: "2px",
    altLiteralValue: "0.125rem",
    tokensJson: { "border-width": { thin: { $value: "1px", $type: "dimension" }, thick: { $value: "4px", $type: "dimension" } } },
  }),
  makeHardcodedValueAdapter({ ruleId: "tokens/no-hardcoded-typography", property: "font-size", cleanValue: "var(--font-size-md)", literalValue: "16px", altLiteralValue: "1rem" }),
  makeHardcodedValueAdapter({ ruleId: "tokens/no-hardcoded-motion", property: "transition", cleanValue: "color var(--duration-fast) var(--ease-standard)", literalValue: "color 200ms ease", altLiteralValue: "color 0.2s ease" }),
  makeHardcodedValueAdapter({ ruleId: "tokens/no-hardcoded-gradient", property: "background", cleanValue: "var(--gradient-brand)", literalValue: "linear-gradient(to right, #ff6b6b, #ffa500)", altLiteralValue: "radial-gradient(circle, #ff0000, #0000ff)" }),
];
