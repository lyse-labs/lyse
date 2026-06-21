import { describe, it, expect } from "vitest";
import { _internal } from "../../src/llm/filter-stage.js";
import type { Finding } from "../../src/types.js";

function finding(message: string): Finding {
  return {
    ruleId: "tokens/no-hardcoded-color",
    axis: "tokens",
    severity: "warning",
    location: { file: "Button.tsx", line: 1, column: 1 },
    message,
  };
}

describe("filter prompt — corpus-validated rubric (#188 / #115)", () => {
  const prompt = _internal.buildFilterPrompt("Button.tsx", "const x = '#fff';", [
    finding("hardcoded color"),
  ]);

  it("exposes buildFilterPrompt", () => {
    expect(typeof _internal.buildFilterPrompt).toBe("function");
  });

  it("rules inline style/css/sx prop colors as violations (not theme-API)", () => {
    expect(prompt).toMatch(/inline\s+`?style`?/i);
    expect(prompt.toLowerCase()).toContain("violation");
  });

  it("rules color-picker / swatch default/value data as palette data (not drift)", () => {
    expect(prompt.toLowerCase()).toMatch(/color[- ]picker|swatch/);
  });

  it("names demo / story / example files explicitly as low-signal", () => {
    expect(prompt.toLowerCase()).toMatch(/stor(y|ies|ybook)/);
    expect(prompt.toLowerCase()).toContain("demo");
    expect(prompt.toLowerCase()).toContain("example");
  });
});
