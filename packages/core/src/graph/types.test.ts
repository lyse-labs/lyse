import { describe, it, expect } from "vitest";
import type { DesignSystemGraph } from "./types.js";

describe("graph/types", () => {
  it("a fully-populated graph literal type-checks and carries schemaVersion 1", () => {
    const g: DesignSystemGraph = {
      schemaVersion: 1,
      tokens: [{ id: "color/brand/primary", axis: "colors", rawValue: "#3b82f6", source: "dtcg" }],
      components: [{
        name: "Button", file: "src/Button.tsx", module: "@acme/ui", exportKind: "named",
        usageCount: 3, props: [], isDsComponent: true, storyRefs: ["button"], detection: "module-config",
      }],
      stories: [{
        id: "button", title: "Button", importPath: "src/Button.stories.tsx",
        componentRef: "Button", hasArgTypes: true, hasArgs: false, storyExportCount: 2,
      }],
      usage: [{ file: "src/App.tsx", kind: "imports-ds-module", count: 1 }],
      zones: { byFile: { "src/Button.tsx": "ds-source" } },
      extraction: {
        entries: [{ extractor: "tokens", status: "ok", evidence: { tokenNodes: 1 }, remediation: null }],
        conflicts: [],
      },
    };
    expect(g.schemaVersion).toBe(1);
    expect(g.tokens[0]?.axis).toBe("colors");
  });
});
