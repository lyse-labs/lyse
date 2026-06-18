import { describe, it, expect } from "vitest";
import { aiGovernanceGraceFactor, DEFAULT_AI_GOVERNANCE_GRACE_WINDOW } from "../grace.js";

describe("aiGovernanceGraceFactor", () => {
  it("is 0 when there is no AI surface (0 markers)", () => {
    expect(aiGovernanceGraceFactor(0)).toBe(0);
    expect(aiGovernanceGraceFactor(-1)).toBe(0);
  });

  it("ramps linearly across the window (default 5)", () => {
    expect(aiGovernanceGraceFactor(1)).toBeCloseTo(0.2);
    expect(aiGovernanceGraceFactor(2)).toBeCloseTo(0.4);
    expect(aiGovernanceGraceFactor(3)).toBeCloseTo(0.6);
    expect(aiGovernanceGraceFactor(4)).toBeCloseTo(0.8);
  });

  it("is 1 at and beyond the window", () => {
    expect(aiGovernanceGraceFactor(5)).toBe(1);
    expect(aiGovernanceGraceFactor(50)).toBe(1);
  });

  it("respects a custom window", () => {
    expect(aiGovernanceGraceFactor(1, 2)).toBeCloseTo(0.5);
    expect(aiGovernanceGraceFactor(2, 2)).toBe(1);
  });

  it("a window of 1 (or less) disables the ramp — any present surface weighs fully", () => {
    expect(aiGovernanceGraceFactor(1, 1)).toBe(1);
    expect(aiGovernanceGraceFactor(1, 0)).toBe(1);
  });

  it("default window is 5", () => {
    expect(DEFAULT_AI_GOVERNANCE_GRACE_WINDOW).toBe(5);
  });
});
