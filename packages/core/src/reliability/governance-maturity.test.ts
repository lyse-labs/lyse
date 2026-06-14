import { describe, it, expect } from "vitest";
import { computeGovernanceMaturityLevel } from "./governance-maturity.js";
import type { GovernanceSignals } from "./governance-maturity.js";

const base: GovernanceSignals = {
  hasReservedAiTokens: false,
  hasMarkerComponent: false,
  hasInteractionAffordance: false,
  hasGovernanceAffordance: false,
};

describe("computeGovernanceMaturityLevel", () => {
  it("L0 — no AI layer at all", () => {
    expect(computeGovernanceMaturityLevel(base)).toBe(0);
  });

  it("L1 — reserved AI tokens but no marker component (decoration)", () => {
    expect(computeGovernanceMaturityLevel({ ...base, hasReservedAiTokens: true })).toBe(1);
  });

  it("L2 — a dedicated AI-marker component is shipped", () => {
    expect(
      computeGovernanceMaturityLevel({ ...base, hasReservedAiTokens: true, hasMarkerComponent: true }),
    ).toBe(2);
  });

  it("L2 — marker component even without reserved tokens", () => {
    expect(computeGovernanceMaturityLevel({ ...base, hasMarkerComponent: true })).toBe(2);
  });

  it("L3 — marker + AI interaction affordances", () => {
    expect(
      computeGovernanceMaturityLevel({
        ...base,
        hasMarkerComponent: true,
        hasInteractionAffordance: true,
      }),
    ).toBe(3);
  });

  it("L4 — marker + interaction + governance affordances", () => {
    expect(
      computeGovernanceMaturityLevel({
        hasReservedAiTokens: true,
        hasMarkerComponent: true,
        hasInteractionAffordance: true,
        hasGovernanceAffordance: true,
      }),
    ).toBe(4);
  });

  it("governance affordances without a marker do not lift past L1 (ladder requires lower rungs)", () => {
    expect(
      computeGovernanceMaturityLevel({
        ...base,
        hasReservedAiTokens: true,
        hasGovernanceAffordance: true,
        hasInteractionAffordance: true,
      }),
    ).toBe(1);
  });

  it("interaction affordance without a marker does not reach L3", () => {
    expect(
      computeGovernanceMaturityLevel({ ...base, hasReservedAiTokens: true, hasInteractionAffordance: true }),
    ).toBe(1);
  });
});
