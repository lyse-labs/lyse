import type { OracleAdapter, FixtureFiles } from "./types.js";

const PKG = JSON.stringify({ name: "fx-hv", version: "1.0.0" });

export interface HardcodedValueSpec {
  ruleId: string;
  property: string;
  cleanValue: string;
  literalValue: string;
  altLiteralValue: string;
}

export function makeHardcodedValueAdapter(spec: HardcodedValueSpec): OracleAdapter {
  const css = (value: string): FixtureFiles => ({
    "package.json": PKG,
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
  makeHardcodedValueAdapter({ ruleId: "tokens/no-hardcoded-spacing", property: "margin", cleanValue: "var(--space-md)", literalValue: "16px", altLiteralValue: "1rem" }),
  makeHardcodedValueAdapter({ ruleId: "tokens/no-hardcoded-border-radius", property: "border-radius", cleanValue: "var(--radius-md)", literalValue: "8px", altLiteralValue: "0.5rem" }),
  makeHardcodedValueAdapter({ ruleId: "tokens/no-hardcoded-z-index", property: "z-index", cleanValue: "var(--z-modal)", literalValue: "100", altLiteralValue: "999" }),
  makeHardcodedValueAdapter({ ruleId: "tokens/no-hardcoded-opacity", property: "opacity", cleanValue: "var(--opacity-muted)", literalValue: "0.5", altLiteralValue: ".5" }),
  makeHardcodedValueAdapter({ ruleId: "tokens/no-hardcoded-border-width", property: "border-width", cleanValue: "var(--border-md)", literalValue: "2px", altLiteralValue: "0.125rem" }),
  makeHardcodedValueAdapter({ ruleId: "tokens/no-hardcoded-typography", property: "font-size", cleanValue: "var(--font-size-md)", literalValue: "16px", altLiteralValue: "1rem" }),
  makeHardcodedValueAdapter({ ruleId: "tokens/no-hardcoded-motion", property: "transition", cleanValue: "color var(--duration-fast) var(--ease-standard)", literalValue: "color 200ms ease", altLiteralValue: "color 0.2s ease" }),
  makeHardcodedValueAdapter({ ruleId: "tokens/no-hardcoded-gradient", property: "background", cleanValue: "var(--gradient-brand)", literalValue: "linear-gradient(to right, #ff6b6b, #ffa500)", altLiteralValue: "radial-gradient(circle, #ff0000, #0000ff)" }),
];
