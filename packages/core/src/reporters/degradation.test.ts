import { describe, it, expect } from "vitest";
import { buildDegradationLines } from "./degradation.js";
import type { AuditResult } from "../types.js";

function baseResult(): AuditResult {
  return {
    schemaVersion: 2, rulesVersion: "0.1.0", toolVersion: "0", scoringVersion: "scoring-v1.1",
    repoRoot: "/x", timestamp: "", stack: [], finalScore: 50, tier: "Quantitative",
    axes: [
      { axis: "tokens", score: 80, findings: 1, opportunities: 10 },
      { axis: "stories", score: "N/A", findings: 0, opportunities: 0 },
      { axis: "a11y", score: "N/A", findings: 0, opportunities: 0 },
    ],
    findings: [],
    meta: {
      extraction: {
        entries: [
          { extractor: "stories", status: "degraded", evidence: { storyFiles: 87, linked: 0 },
            remediation: "DS-self mode: story analysis is skipped in v0.x — the stories axis reports N/A by design." },
        ],
        conflicts: [{ axis: "colors", value: "#fff", tokenIds: ["a", "white"], sources: ["dtcg", "tailwind-v3"] }],
      },
    },
  };
}

describe("buildDegradationLines", () => {
  it("emits the extractor remediation for a degraded N/A axis, a neutral line otherwise, and conflicts", () => {
    const lines = buildDegradationLines(baseResult());
    expect(lines).toEqual([
      "stories: DS-self mode: story analysis is skipped in v0.x — the stories axis reports N/A by design.",
      "a11y: not scored — no a11y opportunities in scope.",
      "token conflict: #fff defined by dtcg + tailwind-v3 (colors).",
    ]);
  });
  it("returns [] when nothing is N/A and there are no conflicts", () => {
    const r = baseResult();
    r.axes = [{ axis: "tokens", score: 80, findings: 1, opportunities: 10 }];
    r.meta = { extraction: { entries: [], conflicts: [] } };
    expect(buildDegradationLines(r)).toEqual([]);
  });
});

function baseResultP0(over: Partial<AuditResult>): AuditResult {
  return {
    schemaVersion: 2, rulesVersion: "0.1.0", toolVersion: "", scoringVersion: "scoring-v1.1",
    repoRoot: "/r", timestamp: "", stack: [], finalScore: 50, tier: "Defined",
    axes: [], findings: [],
    ...over,
  } as AuditResult;
}

describe("buildDegradationLines — insufficient sample (min-N, v3, P3 Task 7)", () => {
  it("emits an insufficient-sample line for an N/A axis with 0 < opportunities < 30", () => {
    const r = baseResultP0({
      axes: [{ axis: "a11y", score: "N/A", findings: 0, opportunities: 13 }],
      meta: { extraction: { entries: [], conflicts: [] } },
    });
    expect(buildDegradationLines(r)).toEqual(["a11y: insufficient sample (n=13) — not scored."]);
  });

  it("still emits the no-opportunities-in-scope line when opportunities is 0 (regression guard)", () => {
    const r = baseResultP0({
      axes: [{ axis: "a11y", score: "N/A", findings: 0, opportunities: 0 }],
      meta: { extraction: { entries: [], conflicts: [] } },
    });
    expect(buildDegradationLines(r)).toEqual(["a11y: not scored — no a11y opportunities in scope."]);
  });

  it("emits no degradation line for a numeric-score axis regardless of opportunities count", () => {
    const r = baseResultP0({
      axes: [{ axis: "a11y", score: 42, findings: 3, opportunities: 13 }],
      meta: { extraction: { entries: [], conflicts: [] } },
    });
    expect(buildDegradationLines(r)).toEqual([]);
  });
});

describe("buildDegradationLines — caveats on numeric axes (P0)", () => {
  it("emits a caveat for a DEGRADED extractor even when the axis has a numeric score", () => {
    const r = baseResultP0({
      axes: [{ axis: "tokens", score: 1, findings: 120, opportunities: 243 }],
      meta: { extraction: { entries: [{ extractor: "tokens", status: "degraded", evidence: {}, remediation: "SCSS token maps not fully parsed." }], conflicts: [] } },
    });
    const lines = buildDegradationLines(r);
    expect(lines.some((l) => l.includes("tokens") && /degraded|unreliable|SCSS token maps/i.test(l))).toBe(true);
  });

  it("emits a self-DS caveat for consumer-adoption axes when meta.dsSelfMode is true", () => {
    const r = baseResultP0({
      axes: [{ axis: "tokens", score: 100, findings: 0, opportunities: 4 }],
      meta: { dsSelfMode: true, extraction: { entries: [{ extractor: "tokens", status: "ok", evidence: {}, remediation: null }], conflicts: [] } },
    });
    const lines = buildDegradationLines(r);
    expect(lines.some((l) => l.includes("tokens") && /self-DS|own source|consumer adoption/i.test(l))).toBe(true);
  });

  it("does NOT emit spurious caveats for a clean consumer audit", () => {
    const r = baseResultP0({
      axes: [{ axis: "tokens", score: 90, findings: 10, opportunities: 100 }],
      meta: { extraction: { entries: [{ extractor: "tokens", status: "ok", evidence: {}, remediation: null }], conflicts: [] } },
    });
    expect(buildDegradationLines(r)).toEqual([]);
  });
});
