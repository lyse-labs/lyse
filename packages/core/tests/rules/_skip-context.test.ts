import { describe, it, expect } from "vitest";
import { isColorTokenDefFile } from "../../src/rules/_skip-context.js";

describe("isColorTokenDefFile — token-definition conventions (P0)", () => {
  it("recognises common DS token-definition files", () => {
    expect(isColorTokenDefFile("packages/theme-chalk/src/common/var.scss")).toBe(true);
    expect(isColorTokenDefFile("src/vars.scss")).toBe(true);
    expect(isColorTokenDefFile("packages/react/src/theme/tokens/colors.ts")).toBe(true);
    expect(isColorTokenDefFile("packages/react/src/theme/semantic-tokens/colors.ts")).toBe(true);
  });
  it("does NOT match ordinary consumer files", () => {
    expect(isColorTokenDefFile("src/components/Button/Button.tsx")).toBe(false);
    expect(isColorTokenDefFile("src/pages/dashboard.tsx")).toBe(false);
  });
  it("does NOT suppress components living under theme/tokens or semantic-tokens dirs (M2)", () => {
    expect(isColorTokenDefFile("packages/react/src/theme/tokens/Button.tsx")).toBe(false);
    expect(isColorTokenDefFile("packages/react/src/theme/semantic-tokens/Panel.jsx")).toBe(false);
  });
});
