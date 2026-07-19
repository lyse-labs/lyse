import { describe, it, expect } from "vitest";
import { join } from "node:path";
import {
  scoreAudit,
  resolveScoreModel,
  DEFAULT_SCORE_MODEL,
} from "../src/scorer.js";
import { SCORING_V2_LEGACY, SCORING_V3 } from "../src/reliability/score/version-pin.js";
import { auditDirectory } from "../src/commands/audit-pipeline.js";
import type { AxisName, Finding, PerRuleOpportunity } from "../src/types.js";

// fixtures/full-ds is under packages/core/ → up 1 (tests → core), then fixtures/.
const FULL_DS = join(import.meta.dirname, "..", "fixtures", "full-ds");

function finding(ruleId: string, axis: AxisName, severity: Finding["severity"], file: string): Finding {
  return { ruleId, axis, severity, location: { file, line: 1, column: 1 }, message: "drift" };
}

// A run with >=2 axes scoring 0, chosen to exercise v2's auto-fail path
// (scoring-contract.test.ts's LOCKED "scoring-v1.1" fixture): tokens and
// ai-surface both score 0.
const OPPORTUNITIES: Record<AxisName, number> = {
  tokens: 10,
  a11y: 0,
  components: 20,
  stories: 0,
  "ai-surface": 10,
  "ai-governance": 0,
};

const PER_RULE_OPPORTUNITIES: PerRuleOpportunity[] = [
  { ruleId: "tokens/ruleA", axis: "tokens", opportunities: 10 },
  { ruleId: "components/ruleC", axis: "components", opportunities: 20 },
  { ruleId: "ai-surface/ruleE", axis: "ai-surface", opportunities: 10 },
];

function findingsFixture(): Finding[] {
  const fs: Finding[] = [];
  for (let i = 0; i < 10; i++) fs.push(finding("tokens/ruleA", "tokens", "error", `src/t${i}.tsx`));
  for (let i = 0; i < 10; i++) fs.push(finding("ai-surface/ruleE", "ai-surface", "error", `src/e${i}.tsx`));
  return fs;
}

describe("resolveScoreModel — precedence", () => {
  it("defaults to DEFAULT_SCORE_MODEL when nothing is provided", () => {
    expect(resolveScoreModel({})).toBe(DEFAULT_SCORE_MODEL);
    expect(resolveScoreModel({})).toBe("v2");
  });

  it("config wins over the default", () => {
    expect(resolveScoreModel({ config: "v3" })).toBe("v3");
  });

  it("env wins over config", () => {
    expect(resolveScoreModel({ config: "v3", env: "v2" })).toBe("v2");
  });

  it("flag wins over env and config", () => {
    expect(resolveScoreModel({ config: "v2", env: "v2", flag: "v3" })).toBe("v3");
  });

  it("throws on an unrecognized model string", () => {
    expect(() => resolveScoreModel({ flag: "v4" })).toThrow(/Invalid scoring model/);
    expect(() => resolveScoreModel({ config: "bogus" })).toThrow(/Invalid scoring model/);
  });
});

describe("scoreAudit — v2 (legacy) branch", () => {
  it("returns schemaVersion 2, scoringVersion scoring-v1.1, and the legacy axis/grade shape", () => {
    const bundle = scoreAudit(
      "v2",
      { findings: findingsFixture(), opportunitiesByAxis: OPPORTUNITIES, perRuleOpportunities: PER_RULE_OPPORTUNITIES },
      {},
    );

    expect(bundle.schemaVersion).toBe(2);
    expect(bundle.scoringVersion).toBe(SCORING_V2_LEGACY);
    expect(bundle.scoringVersion).toBe("scoring-v1.1");
    // 2 axes (tokens, ai-surface) scored 0 -> auto-fail should trip.
    expect(bundle.grade.autoFailed).toBe(true);
    expect(bundle.grade.reasons.length).toBeGreaterThan(0);
    expect(bundle.grade.grade).toBe("Fail");
    expect(bundle.tier).not.toBe("N/A");
    const axisNames = bundle.axes.map((a) => a.axis);
    expect(axisNames).toEqual(["tokens", "a11y", "components", "stories", "ai-surface", "ai-governance"]);
  });

  it("respects aiGovernanceGrace when provided", () => {
    const withoutGrace = scoreAudit(
      "v2",
      { findings: findingsFixture(), opportunitiesByAxis: OPPORTUNITIES, perRuleOpportunities: PER_RULE_OPPORTUNITIES },
      {},
    );
    const withGrace = scoreAudit(
      "v2",
      { findings: findingsFixture(), opportunitiesByAxis: OPPORTUNITIES, perRuleOpportunities: PER_RULE_OPPORTUNITIES },
      { aiGovernanceGrace: 0.5 },
    );
    // aiGovernanceGrace only blends the ai-governance axis, which has 0
    // opportunities here (N/A) — so it's a no-op and both bundles agree.
    // This asserts the option is plumbed through without throwing/diverging
    // unexpectedly for an axis it doesn't touch.
    expect(withGrace.finalScore).toBe(withoutGrace.finalScore);
  });
});

describe("scoreAudit — v3 branch", () => {
  it("returns schemaVersion 3, scoringVersion scoring-v3, and a band-only (non-auto-failing) grade", () => {
    const bundle = scoreAudit(
      "v3",
      { findings: findingsFixture(), opportunitiesByAxis: OPPORTUNITIES, perRuleOpportunities: PER_RULE_OPPORTUNITIES },
      { minSampleSize: 5 },
    );

    expect(bundle.schemaVersion).toBe(3);
    expect(bundle.scoringVersion).toBe(SCORING_V3);
    expect(bundle.scoringVersion).toBe("scoring-v3");
    // v3 has no auto-fail concept — computeGrade is called without autoFail.
    expect(bundle.grade.autoFailed).toBe(false);
    expect(bundle.grade.reasons).toEqual([]);
    const axisNames = bundle.axes.map((a) => a.axis);
    expect(axisNames).toEqual(["tokens", "a11y", "components", "stories", "ai-surface", "ai-governance"]);
  });

  it("N/A's out axes below minSampleSize (default MIN_SAMPLE_SIZE=30)", () => {
    const bundle = scoreAudit(
      "v3",
      { findings: findingsFixture(), opportunitiesByAxis: OPPORTUNITIES, perRuleOpportunities: PER_RULE_OPPORTUNITIES },
      {},
    );
    // No axis in this fixture reaches 30 opportunities -> everything N/A.
    expect(bundle.finalScore).toBe("N/A");
    expect(bundle.tier).toBe("N/A");
    expect(bundle.grade.grade).toBe("N/A");
  });
});

describe("auditDirectory — integration: default stays v2, --score-model v3 opts in", () => {
  it("default (no scoreModel flag) yields schemaVersion 2 / scoring-v1.1", async () => {
    const { result } = await auditDirectory(FULL_DS, { staticOnly: true });
    expect(result.schemaVersion).toBe(2);
    expect(result.scoringVersion).toBe("scoring-v1.1");
  });

  it("scoreModel: 'v3' yields schemaVersion 3 / scoring-v3", async () => {
    const { result } = await auditDirectory(FULL_DS, { staticOnly: true, scoreModel: "v3" });
    expect(result.schemaVersion).toBe(3);
    expect(result.scoringVersion).toBe("scoring-v3");
  });
});
