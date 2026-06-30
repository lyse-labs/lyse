import { describe, it, expect } from "vitest";
import { rule as tokensNoHardcodedColor } from "../../src/rules/tokens-no-hardcoded-color.js";
import { rule as tokensNoHardcodedSpacing } from "../../src/rules/tokens-no-hardcoded-spacing.js";
import { rule as componentsShadowNative } from "../../src/rules/components-shadow-native.js";
import type { Finding, CodemodContext } from "../../src/types.js";

function makeCtx(overrides: Partial<CodemodContext> = {}): CodemodContext {
  return {
    tokens: {
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
    },
    components: new Set(),
    config: {},
    fileContent: "",
    parsedAst: null,
    ...overrides,
  };
}

const colorFinding: Finding = {
  ruleId: "tokens/no-hardcoded-color",
  axis: "tokens",
  severity: "warning",
  location: { file: "/x.tsx", line: 1, column: 1 },
  message: "Hardcoded color value: #3B82F6",
};

const spacingFinding: Finding = {
  ruleId: "tokens/no-hardcoded-spacing",
  axis: "tokens",
  severity: "warning",
  location: { file: "/x.tsx", line: 1, column: 1 },
  message: "Off-scale spacing: 16px",
};

const shadowFinding: Finding = {
  ruleId: "components/no-native-shadows",
  axis: "components",
  severity: "warning",
  location: { file: "/x.tsx", line: 1, column: 1 },
  message: "Native <button> used where <Button> from @acme/ui is available",
};

const CONFIDENCE_VALUES = ["high", "medium", "low"] as const;

describe("Rule.applyCodemod returns the new shape", () => {
  it("tokens/no-hardcoded-color exposes applyCodemod", () => {
    expect(tokensNoHardcodedColor.applyCodemod).toBeDefined();
    const r = tokensNoHardcodedColor.applyCodemod!(colorFinding, makeCtx());
    expect(r).toHaveProperty("diff");
    expect(r).toHaveProperty("importsAdded");
    expect(r).toHaveProperty("confidence");
    expect(CONFIDENCE_VALUES).toContain(r.confidence);
    expect(typeof r.diff).toBe("string");
    expect(Array.isArray(r.importsAdded)).toBe(true);
  });

  it("tokens/no-hardcoded-color returns high confidence when token map has a single match", () => {
    expect(tokensNoHardcodedColor.applyCodemod).toBeDefined();
    const ctx = makeCtx({
      tokens: {
        colors: new Map([["#3b82f6", ["primary-500"]]]),
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
      },
      fileContent: `const x = "#3B82F6";`,
    });
    const r = tokensNoHardcodedColor.applyCodemod!(colorFinding, ctx);
    expect(r.confidence).toBe("high");
    expect(r.diff).toContain("var(--color-primary-500)");
    expect(r.importsAdded).toEqual([]);
    expect(r.warnings).toBeUndefined();
  });

  it("tokens/no-hardcoded-spacing exposes applyCodemod", () => {
    expect(tokensNoHardcodedSpacing.applyCodemod).toBeDefined();
    const r = tokensNoHardcodedSpacing.applyCodemod!(spacingFinding, makeCtx());
    expect(r).toHaveProperty("diff");
    expect(r).toHaveProperty("importsAdded");
    expect(r).toHaveProperty("confidence");
    expect(CONFIDENCE_VALUES).toContain(r.confidence);
  });

  it("tokens/no-hardcoded-spacing returns high confidence with single token match", () => {
    expect(tokensNoHardcodedSpacing.applyCodemod).toBeDefined();
    const ctx = makeCtx({
      tokens: {
        colors: new Map(),
        spacing: new Map([["16", ["space-4"]]]),
        typography: new Map(),
        radii: new Map(),
        shadows: new Map(),
        motion: new Map(),
        breakpoints: new Map(),
        zIndex: new Map(),
        opacity: new Map(),
        borderWidth: new Map(),
        source: "tailwind-v3",
      },
      fileContent: `padding: 16px;`,
    });
    const r = tokensNoHardcodedSpacing.applyCodemod!(spacingFinding, ctx);
    expect(r.confidence).toBe("high");
    expect(r.diff).toContain("var(--spacing-space-4)");
  });

  it("components/no-native-shadows exposes applyCodemod", () => {
    expect(componentsShadowNative.applyCodemod).toBeDefined();
    const r = componentsShadowNative.applyCodemod!(shadowFinding, makeCtx());
    expect(r).toHaveProperty("diff");
    expect(r).toHaveProperty("importsAdded");
    expect(r).toHaveProperty("confidence");
    expect(CONFIDENCE_VALUES).toContain(r.confidence);
  });

  it("components/no-native-shadows injects import when component is not yet imported", () => {
    expect(componentsShadowNative.applyCodemod).toBeDefined();
    const fileContent = [
      `import React from "react";`,
      `export function Foo() { return <button>click</button>; }`,
    ].join("\n");
    const ctx = makeCtx({
      config: { designSystem: { componentsModule: "@acme/ui" } },
      fileContent,
    });
    // The <button> tag is on line 2
    const findingOnLine2: Finding = {
      ...shadowFinding,
      location: { file: "/x.tsx", line: 2, column: 1 },
    };
    const r = componentsShadowNative.applyCodemod!(findingOnLine2, ctx);
    expect(r.importsAdded).toContain(`import { Button } from "@acme/ui";`);
    expect(r.diff).toContain("<Button");
  });
});
