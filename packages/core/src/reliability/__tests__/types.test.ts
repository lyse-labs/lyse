import { describe, expect, it } from "vitest";
import type { SubAxisStatus, ScoringVersion } from "../types.js";

describe("reliability shared types", () => {
  it("ScoringVersion accepts only `scoring-v<n>` strings", () => {
    const v: ScoringVersion = "scoring-v1";
    expect(v).toBe("scoring-v1");
  });
  it("SubAxisStatus has the three known values", () => {
    const a: SubAxisStatus = "stable";
    const b: SubAxisStatus = "experimental";
    const c: SubAxisStatus = "disabled";
    expect([a, b, c].length).toBe(3);
  });
});
