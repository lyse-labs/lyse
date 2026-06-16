import { describe, it, expect } from "vitest";
import { generateGapReport } from "../../src/reliability/gap-report.js";
import type { GovernanceSignals } from "../../src/reliability/governance-maturity.js";

type Bucket = { subAxisId: string; name: string; status: "stable" | "experimental" | "disabled"; countedFindings: number; penalty: number };

function bucket(p: Partial<Bucket>): Bucket {
  return { subAxisId: "x", name: "X", status: "stable", countedFindings: 1, penalty: 2, ...p };
}

const sig = (o: Partial<GovernanceSignals> = {}): GovernanceSignals => ({
  hasReservedAiTokens: false,
  hasMarkerComponent: false,
  hasInteractionAffordance: false,
  hasGovernanceAffordance: false,
  ...o,
});

describe("generateGapReport — score gap", () => {
  it("ranks stable buckets by penalty desc with points recoverable (penalty × 1.5)", () => {
    const r = generateGapReport([
      bucket({ subAxisId: "a", name: "A", penalty: 2, countedFindings: 1 }),
      bucket({ subAxisId: "b", name: "B", penalty: 6, countedFindings: 3 }),
    ]);
    expect(r.scoreGaps.map((g) => g.subAxisId)).toEqual(["b", "a"]);
    expect(r.scoreGaps[0]!.pointsRecoverable).toBe(9); // round(6 * 1.5)
    expect(r.scoreGaps[1]!.pointsRecoverable).toBe(3); // round(2 * 1.5)
  });

  it("excludes experimental buckets and zero-penalty buckets", () => {
    const r = generateGapReport([
      bucket({ subAxisId: "exp", status: "experimental", penalty: 10 }),
      bucket({ subAxisId: "zero", penalty: 0, countedFindings: 0 }),
      bucket({ subAxisId: "real", penalty: 4 }),
    ]);
    expect(r.scoreGaps.map((g) => g.subAxisId)).toEqual(["real"]);
  });

  it("breaks penalty ties deterministically by subAxisId", () => {
    const r = generateGapReport([
      bucket({ subAxisId: "z", penalty: 2 }),
      bucket({ subAxisId: "a", penalty: 2 }),
    ]);
    expect(r.scoreGaps.map((g) => g.subAxisId)).toEqual(["a", "z"]);
  });
});

describe("generateGapReport — maturity gap", () => {
  it("is null when no maturity is provided", () => {
    expect(generateGapReport([]).maturityGap).toBeNull();
  });

  it("for L2 points at L3 and lists the interaction-affordance gap", () => {
    const r = generateGapReport([], { level: 2, signals: sig({ hasMarkerComponent: true, hasReservedAiTokens: true }) });
    expect(r.maturityGap!.currentLevel).toBe(2);
    expect(r.maturityGap!.nextLevel).toBe(3);
    expect(r.maturityGap!.missing.join(" ").toLowerCase()).toContain("interaction");
  });

  it("for L4 has no next level (detectable cap)", () => {
    const r = generateGapReport([], {
      level: 4,
      signals: sig({ hasMarkerComponent: true, hasReservedAiTokens: true, hasInteractionAffordance: true, hasGovernanceAffordance: true }),
    });
    expect(r.maturityGap!.nextLevel).toBeNull();
    expect(r.maturityGap!.missing).toEqual([]);
  });

  it("for L0 points at L1 and mentions reserved AI tokens", () => {
    const r = generateGapReport([], { level: 0, signals: sig() });
    expect(r.maturityGap!.nextLevel).toBe(1);
    expect(r.maturityGap!.missing.join(" ").toLowerCase()).toContain("token");
  });
});
