import { describe, it, expect } from "vitest";
import { summarize, diffSummaries, renderReport, type RepoSummary } from "./summary.js";

const audit = (over: Record<string, unknown> = {}) => ({
  finalScore: 90,
  timestamp: "2026-08-02T12:00:00.000Z",
  toolVersion: "0.2.0-alpha.6",
  repoRoot: "/tmp/whatever/carbon",
  axes: [
    { axis: "tokens", score: "N/A", findings: 1, opportunities: 1 },
    { axis: "components", score: 77, findings: 49, opportunities: 213 },
  ],
  findings: [
    { ruleId: "components/doc-comments", axis: "components", location: { file: "src/A.tsx", line: 3 } },
    { ruleId: "components/doc-comments", axis: "components", location: { file: "src/B.tsx", line: 9 } },
    { ruleId: "tokens/no-hardcoded-spacing", axis: "tokens", location: { file: "src/A.tsx", line: 5 } },
  ],
  meta: {
    extraction: {
      entries: [
        { extractor: "components", status: "ok", evidence: { components: 281 } },
        { extractor: "stories", status: "degraded", evidence: { linked: 0, storyFiles: 103 } },
      ],
    },
  },
  ...over,
});

describe("summarize", () => {
  it("drops everything that changes run-to-run", () => {
    const s = summarize("carbon", audit());
    const serialized = JSON.stringify(s);
    expect(serialized).not.toContain("2026-08-02");
    expect(serialized).not.toContain("0.2.0-alpha.6");
    expect(serialized).not.toContain("/tmp/whatever");
  });

  it("keeps the numbers a reviewer reads: score, per-axis, findings per rule, extraction", () => {
    const s = summarize("carbon", audit());
    expect(s.score).toBe(90);
    expect(s.axes["components"]).toEqual({ score: 77, findings: 49, opportunities: 213 });
    expect(s.findingsByRule["components/doc-comments"]).toBe(2);
    expect(s.extraction["stories"]).toBe("degraded");
  });

  it("survives an audit that failed outright", () => {
    const s = summarize("broken", { error: "ScopeError" });
    expect(s.score).toBe("(no result)");
    expect(s.axes).toEqual({});
  });
});

describe("diffSummaries", () => {
  const before = summarize("carbon", audit());

  it("reports nothing when the two runs agree", () => {
    expect(diffSummaries(before, summarize("carbon", audit()))).toEqual([]);
  });

  it("reports a headline score move", () => {
    const after = summarize("carbon", audit({ finalScore: 78 }));
    expect(diffSummaries(before, after).join(" ")).toContain("score 90 -> 78");
  });

  it("reports an axis that stopped being scored, which is the move that matters most", () => {
    const after = summarize("carbon", audit({
      axes: [
        { axis: "tokens", score: "N/A", findings: 1, opportunities: 1 },
        { axis: "components", score: "N/A", findings: 49, opportunities: 213 },
      ],
    }));
    expect(diffSummaries(before, after).join(" ")).toContain("components 77 -> N/A");
  });

  it("reports a rule that stopped firing and one that started", () => {
    const after = summarize("carbon", audit({
      findings: [{ ruleId: "a11y/semantic-html", axis: "a11y", location: { file: "src/A.tsx", line: 1 } }],
    }));
    const text = diffSummaries(before, after).join(" ");
    expect(text).toContain("components/doc-comments 2 -> 0");
    expect(text).toContain("a11y/semantic-html 0 -> 1");
  });

  it("reports an extraction status flip", () => {
    const after = summarize("carbon", audit({
      meta: { extraction: { entries: [
        { extractor: "components", status: "degraded", evidence: {} },
        { extractor: "stories", status: "degraded", evidence: {} },
      ] } },
    }));
    expect(diffSummaries(before, after).join(" ")).toContain("components ok -> degraded");
  });
});

describe("renderReport", () => {
  const unchanged: RepoSummary = summarize("polaris", audit());

  it("names the repos it compared, including the ones that did not move", () => {
    // A report that lists only changes cannot be told apart from a report where
    // nothing ran. Silence about what was checked is the failure mode here.
    const report = renderReport([
      { repo: "carbon", lines: ["score 90 -> 78"] },
      { repo: "polaris", lines: [] },
    ]);
    expect(report).toContain("carbon");
    expect(report).toContain("polaris");
    expect(report).toContain("1 of 2");
    expect(unchanged.repo).toBe("polaris");
  });

  it("says so explicitly when nothing changed anywhere", () => {
    const report = renderReport([{ repo: "carbon", lines: [] }]);
    expect(report).toContain("No behavioural change");
    expect(report).toContain("the one repository");
    expect(renderReport([{ repo: "a", lines: [] }, { repo: "b", lines: [] }]))
      .toContain("any of the 2 repositories");
  });

  it("names the baseline it compared against, not a hardcoded one", () => {
    // The first version printed "origin/main" whatever BASELINE_REF was set to,
    // so a report against a release tag claimed to be against main.
    expect(renderReport([{ repo: "carbon", lines: [] }], "v0.2.0")).toContain("v0.2.0");
    expect(renderReport([{ repo: "carbon", lines: [] }], "v0.2.0")).not.toContain("origin/main");
  });

  it("says how many repos could not be compared at all", () => {
    const report = renderReport([{ repo: "carbon", lines: [], failed: "audit crashed" }]);
    expect(report).toContain("could not be compared");
    expect(report).toContain("audit crashed");
  });
});
