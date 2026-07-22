import { describe, it, expect } from "vitest";
import { renderSarif } from "../../src/reporters/sarif.js";
import { RULE_METADATA } from "../../src/rules/manifest.js";
import type { AuditResult } from "../../src/types.js";

const sample: AuditResult = {
  schemaVersion: 2,
  rulesVersion: "0.1.0",
  toolVersion: "0.0.1",
  scoringVersion: "scoring-v1",
  repoRoot: "/r",
  timestamp: "2026-05-15T10:00:00Z",
  stack: ["react"],
  finalScore: 43,
  axes: [{ axis: "tokens", score: 31, findings: 1, opportunities: 2 }],
  findings: [
    {
      ruleId: "tokens/no-hardcoded-color",
      axis: "tokens",
      severity: "warning",
      location: { file: "src/Page.tsx", line: 42, column: 18 },
      message: "Hardcoded color #2563eb",
      suggestion: "consider replacing with color.action.primary",
    },
  ],
};

describe("renderSarif", () => {
  it("produces valid SARIF 2.1.0 with required fields", () => {
    const sarif = JSON.parse(renderSarif(sample));
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.$schema).toContain("sarif-2.1.0");
    expect(sarif.runs).toHaveLength(1);
    expect(sarif.runs[0].tool.driver.name).toBe("Lyse");
    expect(sarif.runs[0].tool.driver.version).toBe("0.0.1");
    expect(sarif.runs[0].tool.driver.informationUri).toContain("lyse-labs/lyse");
  });

  it("includes ALL rules in tool.driver.rules (not just those with findings)", () => {
    const sarif = JSON.parse(renderSarif(sample));
    expect(sarif.runs[0].tool.driver.rules).toHaveLength(RULE_METADATA.length);
    const ids = sarif.runs[0].tool.driver.rules.map((r: { id: string }) => r.id);
    expect(ids).toContain("tokens/no-hardcoded-color");
    expect(ids).toContain("tokens/dtcg-conformance");
    expect(ids).toContain("tokens/description-coverage");
    expect(ids).toContain("a11y/essentials");
    expect(ids).toContain("stories/coverage");
    expect(ids).toContain("components/no-native-shadows");
    expect(ids).toContain("components/contracts-strictness");
    expect(ids).toContain("naming/component-pascalcase");
    expect(ids).toContain("naming/hook-prefix");
    expect(ids).toContain("ai-surface/agents-md-quality");
    expect(ids).toContain("ai-surface/component-manifest-json");
    expect(ids).toContain("ai-surface/ds-index-exported");
    expect(ids).toContain("ai-surface/llms-txt-structure");
    expect(ids).toContain("ai-surface/shadcn-registry-valid");
    expect(ids).toContain("ai-surface/agent-instruction-files");
  });

  it("maps severity correctly (info → note)", () => {
    const r: AuditResult = {
      ...sample,
      findings: [
        { ...sample.findings[0]!, severity: "info" },
        { ...sample.findings[0]!, severity: "error" },
      ],
    };
    const sarif = JSON.parse(renderSarif(r));
    expect(sarif.runs[0].results[0].level).toBe("note");
    expect(sarif.runs[0].results[1].level).toBe("error");
  });

  it("clamps startLine and startColumn to ≥ 1 (SARIF spec)", () => {
    const r: AuditResult = {
      ...sample,
      findings: [
        { ...sample.findings[0]!, location: { file: "a", line: 0, column: 0 } },
      ],
    };
    const sarif = JSON.parse(renderSarif(r));
    expect(sarif.runs[0].results[0].locations[0].physicalLocation.region.startLine).toBe(1);
    expect(sarif.runs[0].results[0].locations[0].physicalLocation.region.startColumn).toBe(1);
  });

  it("includes finding.suggestion as a fix description when present", () => {
    const sarif = JSON.parse(renderSarif(sample));
    expect(sarif.runs[0].results[0].fixes[0].description.text).toContain("color.action.primary");
  });

  it("omits timestamp from invocations by default", () => {
    const sarif = JSON.parse(renderSarif(sample));
    expect(sarif.runs[0].invocations[0].startTimeUtc).toBeUndefined();
  });

  it("includes timestamp when option enabled", () => {
    const sarif = JSON.parse(renderSarif(sample, { includeTimestamp: true }));
    expect(sarif.runs[0].invocations[0].startTimeUtc).toBe("2026-05-15T10:00:00Z");
  });

  it("validates SARIF 2.1.0 top-level structure", () => {
    const sarif = JSON.parse(renderSarif(sample));
    // Smoke-validate top-level structure
    expect(sarif).toHaveProperty("$schema");
    expect(sarif).toHaveProperty("version");
    expect(sarif).toHaveProperty("runs");
    expect(Array.isArray(sarif.runs)).toBe(true);
  });

  it("stamps scoringVersion on tool.driver.properties and run.properties.lyse", () => {
    const sarif = JSON.parse(renderSarif(sample));
    expect(sarif.runs[0].tool.driver.properties["lyse.scoringVersion"]).toBe("scoring-v1");
    expect(sarif.runs[0].properties.lyse.scoring_version).toBe("scoring-v1");
  });

  describe("grade in run.properties.lyse", () => {
    it("stamps the letter grade + auto-fail flag when present", () => {
      const r: AuditResult = { ...sample, grade: { grade: "B", autoFailed: false, reasons: [] } };
      const sarif = JSON.parse(renderSarif(r));
      expect(sarif.runs[0].properties.lyse.grade).toBe("B");
      expect(sarif.runs[0].properties.lyse.grade_auto_failed).toBe(false);
    });

    it("reflects an auto-fail", () => {
      const r: AuditResult = { ...sample, grade: { grade: "Fail", autoFailed: true, reasons: ["2 axes scored 0: a11y, components"] } };
      const sarif = JSON.parse(renderSarif(r));
      expect(sarif.runs[0].properties.lyse.grade).toBe("Fail");
      expect(sarif.runs[0].properties.lyse.grade_auto_failed).toBe(true);
    });

    it("emits null grade when absent (back-compat)", () => {
      const sarif = JSON.parse(renderSarif(sample));
      expect(sarif.runs[0].properties.lyse.grade).toBeNull();
    });
  });

  it("emits results in the same order as input findings (no implicit reorder)", () => {
    const r: AuditResult = {
      ...sample,
      findings: [
        { ...sample.findings[0]!, location: { file: "z.tsx", line: 1, column: 1 } },
        { ...sample.findings[0]!, location: { file: "a.tsx", line: 1, column: 1 } },
      ],
    };
    const sarif = JSON.parse(renderSarif(r));
    expect(sarif.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri).toBe("z.tsx");
    expect(sarif.runs[0].results[1].locations[0].physicalLocation.artifactLocation.uri).toBe("a.tsx");
  });

  describe("properties.precision", () => {
    it("omits precision for N=0 rules (no in-repo measurement)", () => {
      const sarif = JSON.parse(renderSarif(sample));
      const rules: { id: string; properties: { precision?: number } }[] =
        sarif.runs[0].tool.driver.rules;
      // tokens/dtcg-conformance has nSamples undefined/0 — no precision should be emitted.
      const dtcg = rules.find((r) => r.id === "tokens/dtcg-conformance");
      expect(dtcg?.properties.precision).toBeUndefined();
    });

    it("emits Wilson LB (not point estimate) for rules with N > 0", () => {
      const sarif = JSON.parse(renderSarif(sample));
      const rules: { id: string; properties: { precision?: number } }[] =
        sarif.runs[0].tool.driver.rules;
      // contracts-strictness: nSamples=68, precisionWilsonLowerBound≈0.901, precisionMeasured=1.0
      const rule = rules.find((r) => r.id === "components/contracts-strictness");
      expect(rule).toBeDefined();
      expect(rule?.properties.precision).toBeDefined();
      // Must be the LB (~0.901), not the flattering point estimate (1.0).
      expect(rule!.properties.precision!).toBeLessThan(1);
      expect(rule!.properties.precision!).toBeGreaterThan(0.89);
    });

    it("omits precision for color (uncalibrated — null Wilson LB)", () => {
      const sarif = JSON.parse(renderSarif(sample));
      const rules: { id: string; properties: { precision?: number } }[] =
        sarif.runs[0].tool.driver.rules;
      // tokens/no-hardcoded-color: real-world precision ~65%, but catalogue is null (uncalibrated).
      const colorRule = rules.find((r) => r.id === "tokens/no-hardcoded-color");
      expect(colorRule?.properties.precision).toBeUndefined();
    });

    it("emits Wilson LB for shadow (N>0 but thin — LB ~0.51)", () => {
      const sarif = JSON.parse(renderSarif(sample));
      const rules: { id: string; properties: { precision?: number } }[] =
        sarif.runs[0].tool.driver.rules;
      const shadowRule = rules.find((r) => r.id === "tokens/no-hardcoded-shadow");
      expect(shadowRule?.properties.precision).toBeDefined();
      // precisionWilsonLowerBound ≈ 0.51, precisionMeasured = 1.0 — must not emit 1.0.
      expect(shadowRule!.properties.precision!).toBeLessThan(0.6);
    });
  });

  describe("suppressions", () => {
    it("emits suppressedFindings in results[] with an in-source suppression", () => {
      const r: AuditResult = {
        ...sample,
        suppressedFindings: [
          { ...sample.findings[0]!, location: { file: "src/Ok.tsx", line: 7, column: 3 } },
        ],
      };
      const sarif = JSON.parse(renderSarif(r));
      expect(sarif.runs[0].results).toHaveLength(2);
      const suppressed = sarif.runs[0].results[1];
      expect(suppressed.suppressions).toEqual([{ kind: "inSource", status: "accepted" }]);
      expect(suppressed.locations[0].physicalLocation.artifactLocation.uri).toBe("src/Ok.tsx");
    });

    it("does not add a suppressions array to normal findings", () => {
      const sarif = JSON.parse(renderSarif(sample));
      expect(sarif.runs[0].results[0]).not.toHaveProperty("suppressions");
    });

    it("emits no extra results when suppressedFindings is absent", () => {
      const sarif = JSON.parse(renderSarif(sample));
      expect(sarif.runs[0].results).toHaveLength(1);
    });
  });

  describe("partialFingerprints", () => {
    it("every result has a non-empty hex lyseFindingId/v1", () => {
      const sarif = JSON.parse(renderSarif(sample));
      const result = sarif.runs[0].results[0];
      expect(result.partialFingerprints).toBeDefined();
      const fp: string = result.partialFingerprints["lyseFindingId/v1"];
      expect(fp).toMatch(/^[0-9a-f]{64}$/);
    });

    it("same AuditResult rendered twice produces identical fingerprints (determinism)", () => {
      const sarif1 = JSON.parse(renderSarif(sample));
      const sarif2 = JSON.parse(renderSarif(sample));
      const fp1: string = sarif1.runs[0].results[0].partialFingerprints["lyseFindingId/v1"];
      const fp2: string = sarif2.runs[0].results[0].partialFingerprints["lyseFindingId/v1"];
      expect(fp1).toBe(fp2);
    });

    it("two findings differing only in ruleId produce different fingerprints", () => {
      const r: AuditResult = {
        ...sample,
        findings: [
          { ...sample.findings[0]!, ruleId: "tokens/no-hardcoded-color" },
          { ...sample.findings[0]!, ruleId: "tokens/dtcg-conformance" },
        ],
      };
      const sarif = JSON.parse(renderSarif(r));
      const fp1: string = sarif.runs[0].results[0].partialFingerprints["lyseFindingId/v1"];
      const fp2: string = sarif.runs[0].results[1].partialFingerprints["lyseFindingId/v1"];
      expect(fp1).not.toBe(fp2);
    });

    it("two findings differing only in file produce different fingerprints", () => {
      const r: AuditResult = {
        ...sample,
        findings: [
          { ...sample.findings[0]!, location: { file: "src/A.tsx", line: 42, column: 1 } },
          { ...sample.findings[0]!, location: { file: "src/B.tsx", line: 42, column: 1 } },
        ],
      };
      const sarif = JSON.parse(renderSarif(r));
      const fp1: string = sarif.runs[0].results[0].partialFingerprints["lyseFindingId/v1"];
      const fp2: string = sarif.runs[0].results[1].partialFingerprints["lyseFindingId/v1"];
      expect(fp1).not.toBe(fp2);
    });

    it("two findings differing only in startLine produce different fingerprints", () => {
      const r: AuditResult = {
        ...sample,
        findings: [
          { ...sample.findings[0]!, location: { file: "src/Page.tsx", line: 10, column: 1 } },
          { ...sample.findings[0]!, location: { file: "src/Page.tsx", line: 20, column: 1 } },
        ],
      };
      const sarif = JSON.parse(renderSarif(r));
      const fp1: string = sarif.runs[0].results[0].partialFingerprints["lyseFindingId/v1"];
      const fp2: string = sarif.runs[0].results[1].partialFingerprints["lyseFindingId/v1"];
      expect(fp1).not.toBe(fp2);
    });

    it("fingerprint is identical regardless of the finding's position in the array (order-independence)", () => {
      const findingA = { ...sample.findings[0]!, location: { file: "src/A.tsx", line: 5, column: 1 } };
      const findingB = { ...sample.findings[0]!, ruleId: "tokens/dtcg-conformance", location: { file: "src/B.tsx", line: 10, column: 1 } };
      const r1: AuditResult = { ...sample, findings: [findingA, findingB] };
      const r2: AuditResult = { ...sample, findings: [findingB, findingA] };
      const sarif1 = JSON.parse(renderSarif(r1));
      const sarif2 = JSON.parse(renderSarif(r2));
      const fpA_pos0: string = sarif1.runs[0].results[0].partialFingerprints["lyseFindingId/v1"];
      const fpA_pos1: string = sarif2.runs[0].results[1].partialFingerprints["lyseFindingId/v1"];
      expect(fpA_pos0).toBe(fpA_pos1);
    });

    it("partialFingerprints are stable when a finding's line moves (diff-first identity)", () => {
      // Same ruleId + file + fixGroup.from (anchor bucket) across both results — only
      // location.line differs. Each result carries a single finding in that bucket, so
      // the diff-first id (keyed on rule+file+bucket+ordinal, never on line) must match.
      const colorFinding = {
        ...sample.findings[0]!,
        location: { file: "src/Page.tsx", line: 12, column: 18 },
        fixGroup: { key: "tokens/no-hardcoded-color::#2563eb", from: "#2563eb" },
      };
      const movedColorFinding = {
        ...colorFinding,
        location: { file: "src/Page.tsx", line: 137, column: 4 },
      };
      const resultA: AuditResult = { ...sample, findings: [colorFinding] };
      const resultB: AuditResult = { ...sample, findings: [movedColorFinding] };

      const sarifA = JSON.parse(renderSarif(resultA));
      const sarifB = JSON.parse(renderSarif(resultB));
      const fpA: string = sarifA.runs[0].results[0].partialFingerprints["lyseFindingId/v1"];
      const fpB: string = sarifB.runs[0].results[0].partialFingerprints["lyseFindingId/v1"];

      expect(fpA).toMatch(/^[0-9a-f]{64}$/);
      expect(fpB).toMatch(/^[0-9a-f]{64}$/);
      expect(fpA).toBe(fpB);
    });
  });
});
