import { describe, it, expect } from "vitest";
import type { DsManifest } from "../manifest/types.js";
import type { AuditResult } from "../types.js";
import { renderAgentsMd } from "./markdown.js";

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

function auditResult(): AuditResult {
  return {
    stack: ["react", "tailwind"],
    toolVersion: "9.9.9",
    rulesVersion: "r1",
    scoringVersion: "scoring-v3",
    timestamp: "2026-01-01T00:00:00.000Z",
  } as unknown as AuditResult;
}

describe("renderAgentsMd — graph-derived", () => {
  it("renders real token ids and values, grouped by axis", () => {
    const md = renderAgentsMd(
      manifest({
        tokens: [
          { id: "color.brand.primary", axis: "colors", value: "#3b82f6", source: "dtcg" },
          { id: "space.4", axis: "spacing", value: "16px", source: "dtcg" },
        ],
      }),
      auditResult(),
    );
    expect(md).toContain("color.brand.primary");
    expect(md).toContain("#3b82f6");
    expect(md).toContain("space.4");
    expect(md).toContain("16px");
  });

  it("renders component contracts including prop variants", () => {
    const md = renderAgentsMd(
      manifest({
        components: [
          {
            name: "Button",
            module: "@acme/ui",
            file: "src/Button.tsx",
            exportKind: "named",
            isDesignSystem: true,
            detection: "module-config",
            usageCount: 12,
            props: [
              { name: "variant", type: '"primary" | "ghost"', optional: true, default: "primary", variants: ["primary", "ghost"] },
            ],
            storyCount: 2,
          },
        ],
      }),
      auditResult(),
    );
    expect(md).toContain("Button");
    expect(md).toContain("@acme/ui");
    expect(md).toContain("variant");
    expect(md).toContain("primary");
    expect(md).toContain("ghost");
  });

  it("carries the token-set hash and manifest schema version for staleness detection", () => {
    const md = renderAgentsMd(manifest({ tokenSetHash: "sha256:deadbeef" }), auditResult());
    expect(md).toContain("sha256:deadbeef");
    expect(md).toContain("schema_version: 1");
  });

  it("still renders the header, stack and hard rules", () => {
    const md = renderAgentsMd(manifest(), auditResult());
    expect(md).toContain("# AGENTS.md");
    expect(md).toContain("react");
    expect(md).toContain("Hard rules");
  });
});
