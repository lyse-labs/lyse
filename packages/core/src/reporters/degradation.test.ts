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
