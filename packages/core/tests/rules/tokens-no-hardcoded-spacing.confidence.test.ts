import { describe, it, expect } from "vitest";
import { rule } from "../../src/rules/tokens-no-hardcoded-spacing.js";
import type { Finding, ClassifyContext, TokenMap } from "../../src/types.js";

function makeCtx(spacing: Map<string, string[]>): ClassifyContext {
  const tokens: TokenMap = {
    colors: new Map(),
    spacing,
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
  return { tokens, components: new Set(), config: {} };
}

function makeFinding(message: string, context?: string): Finding {
  return {
    ruleId: "tokens/no-hardcoded-spacing",
    axis: "tokens",
    severity: "warning",
    location: { file: "src/X.tsx", line: 3, column: 5 },
    message,
    ...(context !== undefined && { context }),
  };
}

describe("tokens/no-hardcoded-spacing classifyConfidence", () => {
  it("returns high when px value matches exactly one spacing token", () => {
    const ctx = makeCtx(new Map([["16", ["spacing.md"]]]));
    const finding = makeFinding("Off-scale spacing: 16px");
    const result = rule.classifyConfidence!(finding, ctx);
    expect(result).toBe("high");
  });

  it("returns medium when negative spacing is present", () => {
    const ctx = makeCtx(new Map([["8", ["spacing.sm"]]]));
    const finding = makeFinding("Off-scale spacing: -8px", "margin: -8px");
    const result = rule.classifyConfidence!(finding, ctx);
    expect(result).toBe("medium");
  });

  it("returns medium when value maps to multiple spacing tokens", () => {
    const ctx = makeCtx(new Map([["8", ["spacing.sm", "spacing.gap-sm"]]]));
    const finding = makeFinding("Off-scale spacing: 8px");
    const result = rule.classifyConfidence!(finding, ctx);
    expect(result).toBe("medium");
  });

  it("returns low when no close token exists in the spacing scale", () => {
    const ctx = makeCtx(new Map([["16", ["spacing.md"]]]));
    const finding = makeFinding("Off-scale spacing: 100px");
    const result = rule.classifyConfidence!(finding, ctx);
    expect(result).toBe("low");
  });
});
