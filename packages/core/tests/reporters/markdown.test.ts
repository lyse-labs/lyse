import { describe, it, expect } from "vitest";
import { renderAgentsMd } from "../../src/reporters/markdown.js";
import type { AuditResult } from "../../src/types.js";

const result: AuditResult = {
  schemaVersion: 2, rulesVersion: "0.1.0", toolVersion: "0.0.1",
  scoringVersion: "scoring-v1",
  repoRoot: "/r", timestamp: "2026-06-10", stack: ["react", "tailwind", "storybook"],
  finalScore: 43, axes: [], findings: [],
};

describe("renderAgentsMd", () => {
  it("produces a deterministic markdown contract", () => {
    const md = renderAgentsMd(result, { tokenNamespaces: ["color/*", "spacing/*"], components: ["Button", "Card"] });
    expect(md).toContain("# AGENTS.md");
    expect(md).toContain("Button");
    expect(md).toContain("color/*");
    expect(md).toMatch(/schema:\s*1/);
  });

  it("stamps the pinned scoring-v1 version string", () => {
    const md = renderAgentsMd(result, { tokenNamespaces: [], components: [] });
    expect(md).toContain("scoring-v1");
    expect(md).toMatch(/Scoring:\s*`scoring-v1`/);
    expect(md).toMatch(/scoring_version:\s*scoring-v1/);
  });
});
