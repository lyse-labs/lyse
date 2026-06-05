import { describe, it, expect } from "vitest";
import { renderSarif } from "../../src/reporters/sarif.js";
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
    expect(sarif.runs[0].tool.driver.rules).toHaveLength(17);
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
});
