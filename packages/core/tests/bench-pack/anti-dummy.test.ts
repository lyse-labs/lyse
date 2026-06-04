import { describe, it, expect } from "vitest";
import { isLikelyDummy, computeIsLikelyDummy } from "../../src/bench/evidence-pack/anti-dummy.js";

describe("isLikelyDummy", () => {
  it("flags files under 100 bytes as dummy", () => {
    expect(isLikelyDummy({ size: 50, lineCount: 4, content: "# Title\n\nbody.\n" })).toBe(true);
  });

  it("flags files under 5 lines as dummy", () => {
    expect(isLikelyDummy({ size: 500, lineCount: 3, content: "# X\n\nshort." })).toBe(true);
  });

  it("flags placeholder-only content", () => {
    expect(isLikelyDummy({ size: 200, lineCount: 8, content: "# TODO\n\nTODO: write me\n" })).toBe(true);
    expect(isLikelyDummy({ size: 200, lineCount: 8, content: "# Placeholder\n\nPlaceholder content.\n" })).toBe(true);
  });

  it("does NOT flag a substantive 30-line manifest", () => {
    const content = "# AGENTS\n\n## Rules\n\n" + "- rule line\n".repeat(30);
    expect(isLikelyDummy({ size: content.length, lineCount: 33, content })).toBe(false);
  });

  it("flags a known dummy hash if provided", () => {
    expect(computeIsLikelyDummy({
      size: 200, lineCount: 10, content: "...",
      sha256: "abc123",
      knownDummyHashes: new Set(["abc123"]),
    })).toBe(true);
  });
});
