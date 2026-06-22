import { describe, it, expect } from "vitest";
import { brandHeader } from "../../src/ui/banner.js";

describe("ui/banner", () => {
  it("omits the brand mark in ASCII mode but keeps the wordmark", () => {
    const out = brandHeader("0.2.0", "design system health", { color: false, unicode: false });
    expect(out).toContain("lyse");
    expect(out).toContain("design system health");
    expect(out).not.toContain("◈");
  });

  it("includes the brand mark in unicode mode", () => {
    const out = brandHeader("0.2.0", "design system health", { color: false, unicode: true });
    expect(out).toContain("◈");
    expect(out).toContain("lyse");
  });
});
