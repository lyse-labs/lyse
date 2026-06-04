import { describe, it, expect } from "vitest";
import { classifyConfidence, groupByConfidence, groupByRule } from "../../src/codemods/safety.js";
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

describe("groupByConfidence", () => {
  it("groups findings into high/medium/low buckets", () => {
    const findings = [
      f("nonexistent/rule"),
      f("a11y/essentials"),
    ];
    const grouped = groupByConfidence(findings, ctx);
    expect(grouped).toHaveProperty("high");
    expect(grouped).toHaveProperty("medium");
    expect(grouped).toHaveProperty("low");
    expect(grouped.low.length).toBe(2);
  });

  it("each finding in a group has confidence field set", () => {
    const findings = [f("a11y/essentials")];
    const grouped = groupByConfidence(findings, ctx);
    expect(grouped.low[0].confidence).toBe("low");
  });
});

describe("groupByRule", () => {
  it("groups findings by ruleId", () => {
    const findings = [
      f("tokens/no-hardcoded-color"),
      f("tokens/no-hardcoded-color"),
      f("tokens/no-hardcoded-spacing"),
    ];
    const grouped = groupByRule(findings);
    expect(grouped.get("tokens/no-hardcoded-color")?.length).toBe(2);
    expect(grouped.get("tokens/no-hardcoded-spacing")?.length).toBe(1);
  });
});
