import { describe, it, expect } from "vitest";
import { score, scoreFromFindings, scoreTotier, type AxisFindings } from "../src/scorer.js";
import type { AxisName, Finding } from "../src/types.js";

const ZERO_FINDINGS: AxisFindings = { errorCount: 0, warningCount: 0, infoCount: 0 };

function noFindings(): Record<AxisName, AxisFindings> {
  return {
    tokens: { ...ZERO_FINDINGS },
    a11y: { ...ZERO_FINDINGS },
    components: { ...ZERO_FINDINGS },
    stories: { ...ZERO_FINDINGS },
    "ai-surface": { ...ZERO_FINDINGS },
    "ai-governance": { ...ZERO_FINDINGS },
  };
}

describe("scorer v2 — base cases", () => {
  it("perfect score when no violations", () => {
    const out = score(noFindings(), {
      tokens: 10, a11y: 5, components: 3, stories: 2, "ai-surface": 0, "ai-governance": 0,
    });
    expect(out.finalScore).toBe(100);
    expect(out.tier).toBe("Autonomous");
    expect(out.scoringK).toBe(0);
    expect(out.axes.find((a) => a.axis === "tokens")!.score).toBe(100);
  });

  it("ai-governance is a valid axis; empty (Track 3 not yet shipped) → N/A, score unchanged", () => {
    // Track 1 (#13) adds the ai-governance axis as plumbing before any rule
    // exists. An empty axis (0 opportunities) MUST score N/A and be excluded
    // from the average, so the Health Score is identical to pre-axis-split.
    const out = score(noFindings(), {
      tokens: 10, a11y: 5, components: 3, stories: 2, "ai-surface": 0, "ai-governance": 0,
    });
    const gov = out.axes.find((a) => a.axis === "ai-governance")!;
    expect(gov).toBeDefined();
    expect(gov.score).toBe("N/A");
    expect(out.finalScore).toBe(100); // unchanged by the empty governance axis
  });

  it("axis with 0 opportunities returns N/A and is excluded from average", () => {
    const findings = noFindings();
    findings.tokens = { errorCount: 0, warningCount: 0, infoCount: 0 };
    const out = score(findings, {
      tokens: 10, a11y: 5, components: 3, stories: 0, "ai-surface": 0, "ai-governance": 0,
    });
    const stories = out.axes.find((a) => a.axis === "stories")!;
    expect(stories.score).toBe("N/A");
    expect(stories.rateScore).toBe("N/A");
    expect(stories.absoluteCap).toBe("N/A");
    expect(out.finalScore).toBe(100);
  });
});

describe("scorer v2 — severity weighting", () => {
  it("all info findings on 100 opp — rate drops to 0 (weighted=100 == opp)", () => {
    // 100 info → weighted = 100 → rate = 100*(1 - 100/100) = 0
    // K=0 → cap = 100 (no-op). min(0, 100) = 0.
    const findings = noFindings();
    findings.tokens = { errorCount: 0, warningCount: 0, infoCount: 100 };
    const out = score(findings, {
      tokens: 100, a11y: 0, components: 0, stories: 0, "ai-surface": 0, "ai-governance": 0,
    });
    const axis = out.axes.find((a) => a.axis === "tokens")!;
    expect(axis.score).toBe(0);
    expect(axis.weightedFindings).toBe(100);
    expect(axis.findings).toBe(100);
  });

  it("all error findings — 25 errors on 100 opp produces axis score 0", () => {
    // 25 errors → weighted = 100 → rate = 0. K=0 → cap = 100. Final = 0.
    const findings = noFindings();
    findings.tokens = { errorCount: 25, warningCount: 0, infoCount: 0 };
    const out = score(findings, {
      tokens: 100, a11y: 0, components: 0, stories: 0, "ai-surface": 0, "ai-governance": 0,
    });
    expect(out.axes.find((a) => a.axis === "tokens")!.score).toBe(0);
  });

  it("severity mix — 1 error + 5 warnings + 10 info on 100 opp", () => {
    // weighted = 4 + 10 + 10 = 24. rate = 76. K=0 → cap = 100. min(76, 100) = 76.
    // tier "Quantitative".
    const findings = noFindings();
    findings.tokens = { errorCount: 1, warningCount: 5, infoCount: 10 };
    const out = score(findings, {
      tokens: 100, a11y: 0, components: 0, stories: 0, "ai-surface": 0, "ai-governance": 0,
    });
    const axis = out.axes.find((a) => a.axis === "tokens")!;
    expect(axis.weightedFindings).toBe(24);
    expect(axis.rateScore).toBe(76);
    expect(axis.absoluteCap).toBe(100); // K=0 → cap is a no-op
    expect(axis.score).toBe(76);
    expect(out.finalScore).toBe(76);
    expect(out.tier).toBe("Quantitative");
  });

  it("rate dominates everywhere — 1 error on 10000 opp", () => {
    // weighted = 4. rate ≈ 99.96. K=0 → cap = 100. min(100, 100) = 100.
    // (Under the pre-calibration K=8 the cap would have pulled this to 94;
    // post-calibration the corpus says the cap should not kick in.)
    const findings = noFindings();
    findings.tokens = { errorCount: 1, warningCount: 0, infoCount: 0 };
    const out = score(findings, {
      tokens: 10000, a11y: 0, components: 0, stories: 0, "ai-surface": 0, "ai-governance": 0,
    });
    const axis = out.axes.find((a) => a.axis === "tokens")!;
    expect(axis.rateScore).toBe(100); // rounded from 99.96
    expect(axis.absoluteCap).toBe(100);
    expect(axis.score).toBe(100);
    expect(out.tier).toBe("Autonomous");
  });
});

describe("scorer v2 — equal-weight averaging", () => {
  it("equal axis weighting — 80/80/60 across 3 axes averages to 73 (proves no tokens-heavy bias)", () => {
    // 80 / 80 / 60 → (80 + 80 + 60) / 3 = 73.33 → 73.
    //   axis=80: rate=80 from 20 info / 100 opp. K=0 → cap=100 → min=80.
    //   axis=60: rate=60 from 40 info / 100 opp. K=0 → cap=100 → min=60.
    const findings = noFindings();
    findings.tokens = { errorCount: 0, warningCount: 0, infoCount: 20 };
    findings.a11y = { errorCount: 0, warningCount: 0, infoCount: 20 };
    findings.components = { errorCount: 0, warningCount: 0, infoCount: 40 };
    const out = score(findings, {
      tokens: 100, a11y: 100, components: 100, stories: 0, "ai-surface": 0, "ai-governance": 0,
    });
    expect(out.axes.find((a) => a.axis === "tokens")!.score).toBe(80);
    expect(out.axes.find((a) => a.axis === "a11y")!.score).toBe(80);
    expect(out.axes.find((a) => a.axis === "components")!.score).toBe(60);
    expect(out.finalScore).toBe(73);
  });

  it("no active axes — all opportunities=0 yields N/A score and N/A tier", () => {
    const out = score(noFindings(), {
      tokens: 0, a11y: 0, components: 0, stories: 0, "ai-surface": 0, "ai-governance": 0,
    });
    expect(out.finalScore).toBe("N/A");
    expect(out.tier).toBe("N/A");
    for (const axis of out.axes) {
      expect(axis.score).toBe("N/A");
    }
  });
});

describe("scorer v2 — maturity tier mapping", () => {
  it("maps boundary scores to CMMI-style tiers", () => {
    expect(scoreTotier(0)).toBe("Foundational");
    expect(scoreTotier(19)).toBe("Foundational");
    expect(scoreTotier(20)).toBe("Managed");
    expect(scoreTotier(39)).toBe("Managed");
    expect(scoreTotier(40)).toBe("Defined");
    expect(scoreTotier(59)).toBe("Defined");
    expect(scoreTotier(60)).toBe("Quantitative");
    expect(scoreTotier(79)).toBe("Quantitative");
    expect(scoreTotier(80)).toBe("Autonomous");
    expect(scoreTotier(100)).toBe("Autonomous");
  });

  it("passes through N/A", () => {
    expect(scoreTotier("N/A")).toBe("N/A");
  });
});

describe("scorer v2 — scoreFromFindings adapter", () => {
  it("aggregates a flat Finding[] into per-axis severity buckets", () => {
    const mk = (axis: AxisName, severity: "error" | "warning" | "info"): Finding => ({
      ruleId: "tokens/no-hardcoded-color",
      axis,
      severity,
      location: { file: "x.ts", line: 1, column: 1 },
      message: "x",
    });
    const findings: Finding[] = [
      mk("tokens", "error"),
      mk("tokens", "warning"),
      mk("tokens", "warning"),
      mk("tokens", "info"),
    ];
    const out = scoreFromFindings(findings, {
      tokens: 100, a11y: 0, components: 0, stories: 0, "ai-surface": 0, "ai-governance": 0,
    });
    const axis = out.axes.find((a) => a.axis === "tokens")!;
    // weighted = 4 + 2 + 2 + 1 = 9 → rate = 91. K=0 → cap = 100. min(91, 100) = 91.
    expect(axis.weightedFindings).toBe(9);
    expect(axis.findings).toBe(4);
    expect(axis.score).toBe(91);
  });
});

describe("scorer ai-governance grace ramp (#89 / ADR-0018)", () => {
  function govCratered(): Record<AxisName, AxisFindings> {
    const f = noFindings();
    // ai-governance axis with heavy findings (would score 0 without grace).
    f["ai-governance"] = { errorCount: 0, warningCount: 10, infoCount: 0 };
    return f;
  }
  const opp: Record<AxisName, number> = {
    tokens: 0, a11y: 0, components: 0, stories: 0, "ai-surface": 0, "ai-governance": 10,
  };

  it("grace < 1 blends the ai-governance axis toward 100 (nascent AI surface)", () => {
    const full = score(govCratered(), opp, { aiGovernanceGrace: 1 });
    const graced = score(govCratered(), opp, { aiGovernanceGrace: 0.2 });
    const govFull = full.axes.find((a) => a.axis === "ai-governance")!.score as number;
    const govGraced = graced.axes.find((a) => a.axis === "ai-governance")!.score as number;
    expect(govFull).toBe(0);
    expect(govGraced).toBeGreaterThanOrEqual(79); // 0.2*0 + 0.8*100 = 80
  });

  it("grace 1 (default) is inert", () => {
    const a = score(govCratered(), opp);
    const b = score(govCratered(), opp, { aiGovernanceGrace: 1 });
    expect(a.finalScore).toBe(b.finalScore);
  });

  it("grace only touches ai-governance, not other axes", () => {
    const f = noFindings();
    f.tokens = { errorCount: 0, warningCount: 10, infoCount: 0 };
    const o: Record<AxisName, number> = { ...opp, tokens: 10, "ai-governance": 0 };
    const a = score(f, o, { aiGovernanceGrace: 0.2 });
    const b = score(f, o, { aiGovernanceGrace: 1 });
    expect(a.finalScore).toBe(b.finalScore);
  });
});
