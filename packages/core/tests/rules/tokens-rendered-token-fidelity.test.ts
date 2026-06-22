import { describe, it, expect } from "vitest";
import { detectRenderDrift } from "../../src/rules/tokens-rendered-token-fidelity.js";
import { cssVarToTokenPath } from "../../src/render/dtcg-canonical-map.js";

describe("detectRenderDrift", () => {
  it("flags a token whose computed value differs from its DTCG canonical declaration", () => {
    const canonical = new Map([["color/bg", "#ffffff"]]);
    const findings = detectRenderDrift(
      canonical,
      [{ token: "--color-bg", mode: "root", computed: "#ff0000" }],
      cssVarToTokenPath,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.ruleId).toBe("tokens/rendered-token-fidelity");
    expect(findings[0]!.message).toContain("DTCG");
  });

  it("does not flag when computed matches the DTCG canonical value", () => {
    const canonical = new Map([["color/bg", "#ffffff"]]);
    const findings = detectRenderDrift(
      canonical,
      [{ token: "--color-bg", mode: "root", computed: "#ffffff" }],
      cssVarToTokenPath,
    );
    expect(findings).toHaveLength(0);
  });

  it("skips tokens with no mapping from CSS var to token path", () => {
    const canonical = new Map([["color/bg", "#ffffff"]]);
    const findings = detectRenderDrift(
      canonical,
      [{ token: "--unknown-x", mode: "root", computed: "#ff0000" }],
      cssVarToTokenPath,
    );
    expect(findings).toHaveLength(0);
  });

  it("skips non-canonicalizable values without flagging", () => {
    const canonical = new Map([["color/bg", "oklch(0.7 0.1 200)"]]);
    const findings = detectRenderDrift(
      canonical,
      [{ token: "--color-bg", mode: "root", computed: "oklch(0.9 0.2 300)" }],
      cssVarToTokenPath,
    );
    expect(findings).toHaveLength(0);
  });
});
