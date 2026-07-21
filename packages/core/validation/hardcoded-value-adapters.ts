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
   * generates. Axes migrated onto the four-class resolver (see
   * tokens-no-hardcoded-spacing.ts) can only ever classify `exact`/`near` by
   * anchoring on a real token id — with none present, every mutation
   * resolves `novel` (info), which `ruleFlagged` (error/warning only) cannot
   * register as a violation. `isCssCustomPropertyDeclaration` already
   * guard-suppresses the declaration itself, so this file never produces a
   * finding of its own.
   */
  tokenSource?: string;
}

export function makeHardcodedValueAdapter(spec: HardcodedValueSpec): OracleAdapter {
  const css = (value: string): FixtureFiles => ({
    "package.json": PKG,
    ...(spec.tokenSource !== undefined && { "src/tokens.css": spec.tokenSource }),
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
  // `exact` (on the repo's own scale) is COMPLIANT, not drift, so 16px/1rem
  // must resolve `near` against a real-but-different scale — not `exact`
  // (would silently pass) and not `novel` from zero tokens (would be info,
  // invisible to this error/warning-only oracle). --space-sm/--space-lg (8px,
  // 32px) put 16 one step off a real token without landing on it.
  makeHardcodedValueAdapter({
    ruleId: "tokens/no-hardcoded-spacing",
    property: "margin",
    cleanValue: "var(--space-md)",
    literalValue: "16px",
    altLiteralValue: "1rem",
    tokenSource: ":root { --space-sm: 8px; --space-lg: 32px; }",
  }),
  makeHardcodedValueAdapter({ ruleId: "tokens/no-hardcoded-border-radius", property: "border-radius", cleanValue: "var(--radius-md)", literalValue: "8px", altLiteralValue: "0.5rem" }),
  makeHardcodedValueAdapter({ ruleId: "tokens/no-hardcoded-z-index", property: "z-index", cleanValue: "var(--z-modal)", literalValue: "100", altLiteralValue: "999" }),
  makeHardcodedValueAdapter({ ruleId: "tokens/no-hardcoded-opacity", property: "opacity", cleanValue: "var(--opacity-muted)", literalValue: "0.5", altLiteralValue: ".5" }),
  makeHardcodedValueAdapter({ ruleId: "tokens/no-hardcoded-border-width", property: "border-width", cleanValue: "var(--border-md)", literalValue: "2px", altLiteralValue: "0.125rem" }),
  makeHardcodedValueAdapter({ ruleId: "tokens/no-hardcoded-typography", property: "font-size", cleanValue: "var(--font-size-md)", literalValue: "16px", altLiteralValue: "1rem" }),
  makeHardcodedValueAdapter({ ruleId: "tokens/no-hardcoded-motion", property: "transition", cleanValue: "color var(--duration-fast) var(--ease-standard)", literalValue: "color 200ms ease", altLiteralValue: "color 0.2s ease" }),
  makeHardcodedValueAdapter({ ruleId: "tokens/no-hardcoded-gradient", property: "background", cleanValue: "var(--gradient-brand)", literalValue: "linear-gradient(to right, #ff6b6b, #ffa500)", altLiteralValue: "radial-gradient(circle, #ff0000, #0000ff)" }),
];
