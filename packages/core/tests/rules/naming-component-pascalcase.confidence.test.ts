import { describe, it, expect } from "vitest";
import { rule } from "../../src/rules/naming-component-pascalcase.js";
import type { Finding, ClassifyContext, TokenMap } from "../../src/types.js";

function makeTokenMap(): TokenMap {
  return {
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
}

function makeCtx(): ClassifyContext {
  return {
    tokens: makeTokenMap(),
    components: new Set(),
    config: {},
  };
}

function makeFinding(message: string, context?: string): Finding {
  return {
    ruleId: "naming/component-pascalcase",
    axis: "components",
    severity: "warning",
    location: { file: "src/MyComp.tsx", line: 3, column: 1 },
    message,
    ...(context !== undefined && { context }),
  };
}

describe("naming/component-pascalcase classifyConfidence", () => {
  it("returns high for a simple camelCase name (myButton)", () => {
    const finding = makeFinding("Component 'myButton' is not PascalCase");
    const result = rule.classifyConfidence!(finding, makeCtx());
    expect(result).toBe("high");
  });

  it("returns medium for snake_case name (my_component)", () => {
    const finding = makeFinding("Component 'my_component' is not PascalCase");
    const result = rule.classifyConfidence!(finding, makeCtx());
    expect(result).toBe("medium");
  });

  it("returns medium for a name with underscore prefix (_button)", () => {
    // Not strictly flagged but if somehow reaching here
    const finding = makeFinding("Component '_button' is not PascalCase");
    const result = rule.classifyConfidence!(finding, makeCtx());
    expect(result).toBe("medium");
  });

  it("returns low when component name cannot be parsed from message", () => {
    const finding = makeFinding("Component '' is not PascalCase");
    const result = rule.classifyConfidence!(finding, makeCtx());
    expect(result).toBe("low");
  });

  it("returns high for a simple lowercase name with no underscores (myCard)", () => {
    const finding = makeFinding("Component 'myCard' is not PascalCase");
    const result = rule.classifyConfidence!(finding, makeCtx());
    expect(result).toBe("high");
  });

  it("rule has classifyConfidence defined", () => {
    expect(rule.classifyConfidence).toBeDefined();
  });

  it("rule has applyCodemod defined", () => {
    expect(rule.applyCodemod).toBeDefined();
  });
});
