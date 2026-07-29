import { describe, it, expect } from "vitest";
import { renderAgentsMd } from "../../src/reporters/markdown.js";
import type { DsManifest } from "../../src/manifest/types.js";
import type { AuditResult } from "../../src/types.js";

function manifest(overrides: Partial<DsManifest> = {}): DsManifest {
  return {
    schemaVersion: 1,
    generator: { name: "lyse", version: "9.9.9" },
    tokenSetHash: "sha256:abc123",
    tokens: [],
    components: [],
    zones: { "ds-source": 0, app: 0, story: 0, test: 0, generated: 0, vendored: 0, config: 0 },
    usage: [],
    extraction: { entries: [], conflicts: [] },
    ...overrides,
  };
}

const result = {
  schemaVersion: 2, rulesVersion: "0.1.0", toolVersion: "0.0.1",
  scoringVersion: "scoring-v1",
  repoRoot: "/r", timestamp: "2026-06-10", stack: ["react", "tailwind", "storybook"],
  finalScore: 43, axes: [], findings: [],
} as unknown as AuditResult;

describe("renderAgentsMd", () => {
  it("produces a deterministic markdown contract", () => {
    const md = renderAgentsMd(
      manifest({
        tokens: [{ id: "color.brand.primary", axis: "colors", value: "#3b82f6", source: "dtcg" }],
        components: [
          {
            name: "Button",
            module: "@acme/ui",
            file: "src/Button.tsx",
            exportKind: "named",
            isDesignSystem: true,
            detection: "module-config",
            usageCount: 1,
            props: [],
            storyCount: 0,
          },
        ],
      }),
      result,
    );
    expect(md).toContain("# AGENTS.md");
    expect(md).toContain("Button");
    // Was `expect(md).toContain("color/*")` — that asserted the old bare
    // namespace placeholder. renderAgentsMd now renders real token ids/values
    // sourced from the manifest, so assert on those instead.
    expect(md).toContain("color.brand.primary");
    expect(md).toContain("#3b82f6");
    expect(md).toMatch(/schema:\s*1/);
  });

  it("stamps the pinned scoring-v1 version string", () => {
    const md = renderAgentsMd(manifest(), result);
    expect(md).toContain("scoring-v1");
    expect(md).toMatch(/Scoring:\s*`scoring-v1`/);
    expect(md).toMatch(/scoring_version:\s*scoring-v1/);
  });
});
