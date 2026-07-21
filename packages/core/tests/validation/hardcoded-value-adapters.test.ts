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
      // Resolver-migrated (Task 6): `exact` (on the repo's own scale) is
      // compliant, not drift, so the injected literal needs a real-but-
      // different scale to resolve `near` — see the array entry in
      // hardcoded-value-adapters.ts for the full rationale.
      tokenSource: ":root { --space-sm: 8px; --space-lg: 32px; }",
    });
    const score = await evaluateAdapter(adapter);
    expect(score.matrix.fn).toBe(0); // injected literal is caught
  }, 60_000);
});
