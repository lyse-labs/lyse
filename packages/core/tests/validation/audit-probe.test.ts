import { describe, it, expect } from "vitest";
import { ruleFlagged } from "../../validation/audit-probe.js";

const RULE = "tokens/no-hardcoded-color";
const PKG = JSON.stringify({ name: "fx", version: "1.0.0" });

describe("ruleFlagged (real static audit)", () => {
  it("flags a hardcoded hex", async () => {
    const flagged = await ruleFlagged(
      { "package.json": PKG, "src/x.css": ".a { color: #2563eb; }" },
      RULE,
    );
    expect(flagged).toBe(true);
  });

  it("does not flag a CSS variable", async () => {
    const flagged = await ruleFlagged(
      { "package.json": PKG, "src/x.css": ".a { color: var(--color-action); }" },
      RULE,
    );
    expect(flagged).toBe(false);
  });
});
