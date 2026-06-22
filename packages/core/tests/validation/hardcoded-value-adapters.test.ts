import { describe, it, expect } from "vitest";
import { makeHardcodedValueAdapter } from "../../validation/hardcoded-value-adapters.js";
import { evaluateAdapter } from "../../validation/run-adapter.js";

describe("makeHardcodedValueAdapter", () => {
  it("builds a spacing adapter that catches an injected px literal", async () => {
    const adapter = makeHardcodedValueAdapter({
      ruleId: "tokens/no-hardcoded-spacing",
      property: "margin",
      cleanValue: "var(--space-md)",
      literalValue: "16px",
      altLiteralValue: "1rem",
    });
    const score = await evaluateAdapter(adapter);
    expect(score.matrix.fn).toBe(0); // injected literal is caught
  }, 60_000);
});
