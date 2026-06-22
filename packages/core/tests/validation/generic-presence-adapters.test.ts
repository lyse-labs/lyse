import { describe, it, expect } from "vitest";
import { makePresenceAdapter } from "../../validation/generic-presence-adapters.js";
import { evaluateAdapter } from "../../validation/run-adapter.js";

describe("makePresenceAdapter", () => {
  it("builds an adapter whose mutation deletes the required file", async () => {
    const adapter = makePresenceAdapter({
      ruleId: "versioning/changelog-present",
      requiredPath: "CHANGELOG.md",
      goodContent: "# Changelog\n\n## [1.0.0]\n- initial release\n",
    });
    const score = await evaluateAdapter(adapter);
    expect(score.matrix.fn).toBe(0); // deleting CHANGELOG.md is caught
  }, 60_000);
});
