import { describe, it, expect } from "vitest";
import { detectRenderDrift } from "../../src/rules/tokens-rendered-token-fidelity.js";

const CSS = `:root { --color-bg: #ffffff; } .dark { --color-bg: #111111; }`;

describe("detectRenderDrift", () => {
  it("flags a token whose computed value differs from its source declaration", () => {
    const findings = detectRenderDrift(CSS, [
      { token: "--color-bg", mode: "root", computed: "rgb(255, 0, 0)" },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.ruleId).toBe("tokens/rendered-token-fidelity");
  });
  it("does not flag when computed matches the source declaration (canonicalized)", () => {
    const findings = detectRenderDrift(CSS, [
      { token: "--color-bg", mode: "root", computed: "rgb(255, 255, 255)" },
    ]);
    expect(findings).toHaveLength(0);
  });
  it("skips non-canonicalizable values without flagging", () => {
    const findings = detectRenderDrift(`:root { --x: oklch(0.7 0.1 200); }`, [
      { token: "--x", mode: "root", computed: "oklch(0.7 0.1 200)" },
    ]);
    expect(findings).toHaveLength(0);
  });
});
