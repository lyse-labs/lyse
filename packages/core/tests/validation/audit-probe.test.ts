import { describe, it, expect } from "vitest";
import { ruleFlagged } from "../../validation/audit-probe.js";

const RULE = "tokens/no-hardcoded-color";
const PKG = JSON.stringify({ name: "fx", version: "1.0.0" });

describe("ruleFlagged (real static audit)", () => {
  it("flags a hardcoded hex", async () => {
    // `:root` establishes a real color token matching the literal below, so the
    // four-class resolver (graph/resolve) classifies it `exact` (severity
    // "warning") rather than `novel` (severity "info", which ruleFlagged does
    // not count as a flag — a `novel` value has no known token to compare
    // against, so it is honestly "I see this value, I don't think it's
    // drift," not a confirmed violation). The `:root` declaration itself is
    // never flagged (isCssCustomPropertyDeclaration guard).
    const flagged = await ruleFlagged(
      { "package.json": PKG, "src/x.css": ":root { --color-brand: #2563eb; } .a { color: #2563eb; }" },
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
