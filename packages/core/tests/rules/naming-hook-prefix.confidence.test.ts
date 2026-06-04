import { describe, it, expect } from "vitest";
import { rule } from "../../src/rules/naming-hook-prefix.js";
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
    ruleId: "naming/hook-prefix",
    axis: "components",
    severity: "warning",
    location: { file: "src/hooks.ts", line: 3, column: 1 },
    message,
    ...(context !== undefined && { context }),
  };
}

describe("naming/hook-prefix classifyConfidence", () => {
  it("returns high for a simple camelCase function name (getMyData)", () => {
    const finding = makeFinding("Hook 'getMyData' does not start with 'use' + uppercase letter");
    const result = rule.classifyConfidence!(finding, makeCtx());
    expect(result).toBe("high");
  });

  it("returns high for a simple verb-first name (fetchUser)", () => {
    const finding = makeFinding("Hook 'fetchUser' does not start with 'use' + uppercase letter");
    const result = rule.classifyConfidence!(finding, makeCtx());
    expect(result).toBe("high");
  });

  it("returns medium for a snake_case name (get_my_data)", () => {
    const finding = makeFinding("Hook 'get_my_data' does not start with 'use' + uppercase letter");
    const result = rule.classifyConfidence!(finding, makeCtx());
    expect(result).toBe("medium");
  });

  it("returns low when hook name cannot be parsed from message", () => {
    const finding = makeFinding("Hook '' does not start with 'use' + uppercase letter");
    const result = rule.classifyConfidence!(finding, makeCtx());
    expect(result).toBe("low");
  });

  it("returns high for loadSomething pattern", () => {
    const finding = makeFinding("Hook 'loadData' does not start with 'use' + uppercase letter");
    const result = rule.classifyConfidence!(finding, makeCtx());
    expect(result).toBe("high");
  });

  it("rule has classifyConfidence defined", () => {
    expect(rule.classifyConfidence).toBeDefined();
  });

  it("rule has applyCodemod defined", () => {
    expect(rule.applyCodemod).toBeDefined();
  });

  it("returns medium for kebab-like pattern (would be unusual but test fallback)", () => {
    // Underscores/hyphens in hook names are unusual but should return medium
    const finding = makeFinding("Hook 'get-data' does not start with 'use' + uppercase letter");
    const result = rule.classifyConfidence!(finding, makeCtx());
    expect(result).toBe("medium");
  });
});
