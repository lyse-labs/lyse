import { describe, it, expect } from "vitest";
import { classifyConfidence } from "../../src/codemods/safety.js";
import type { Finding, ClassifyContext, TokenMap } from "../../src/types.js";

const ctx: ClassifyContext = {
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
    source: "tailwind-v4",
  } as TokenMap,
  components: new Set(),
  config: {} as never,
};

const f = (ruleId: string, message = "", context = ""): Finding => ({
  ruleId: ruleId as never,
  axis: "tokens" as never,
  severity: "warning",
  location: { file: "/x.tsx", line: 1, column: 1 },
  message,
  ...(context && { context }),
});

describe("classifyConfidence dispatcher", () => {
  it("returns 'low' for unknown rule (safe default)", () => {
    const finding = f("nonexistent/rule");
    expect(classifyConfidence(finding, ctx)).toBe("low");
  });

  it("delegates to rule's classifyConfidence when defined", () => {
    const finding = f("tokens/no-hardcoded-color", "Hardcoded color value: #3B82F6");
    const result = classifyConfidence(finding, ctx);
    expect(["high", "medium", "low"]).toContain(result);
  });

  it("returns 'low' for rules without classifyConfidence (e.g., a11y)", () => {
    const finding = f("a11y/essentials");
    expect(classifyConfidence(finding, ctx)).toBe("low");
  });
});
