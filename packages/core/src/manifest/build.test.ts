import { describe, it, expect } from "vitest";
import type { DesignSystemGraph } from "../graph/types.js";
import { buildManifest } from "./build.js";

function graph(overrides: Partial<DesignSystemGraph> = {}): DesignSystemGraph {
  return {
    schemaVersion: 1,
    tokens: [],
    components: [],
    stories: [],
    usage: [],
    zones: { byFile: {} },
    extraction: { entries: [], conflicts: [] },
    ...overrides,
  };
}

describe("buildManifest", () => {
  it("projects tokens sorted by id, renaming rawValue -> value", () => {
    const m = buildManifest(
      graph({
        tokens: [
          { id: "color.b", axis: "colors", rawValue: "#222222", source: "dtcg" },
          { id: "color.a", axis: "colors", rawValue: "#111111", source: "dtcg" },
        ],
      }),
      { version: "9.9.9" },
    );
    expect(m.schemaVersion).toBe(1);
    expect(m.generator).toEqual({ name: "lyse", version: "9.9.9" });
    expect(m.tokens).toEqual([
      { id: "color.a", axis: "colors", value: "#111111", source: "dtcg" },
      { id: "color.b", axis: "colors", value: "#222222", source: "dtcg" },
    ]);
  });

  it("normalizes optional prop fields to explicit null/false/[]", () => {
    const m = buildManifest(
      graph({
        components: [
          {
            name: "Button",
            file: "src/Button.tsx",
            module: "@acme/ds",
            exportKind: "named",
            usageCount: 3,
            props: [
              { name: "variant", typeText: '"a" | "b"', isOptional: true, isVariantUnion: true, variants: ["a", "b"] },
              { name: "id" },
            ],
            isDsComponent: true,
            storyRefs: ["s1", "s2"],
            detection: "module-config",
          },
        ],
      }),
      { version: "1.0.0" },
    );
    const c = m.components[0];
    expect(c?.isDesignSystem).toBe(true);
    expect(c?.storyCount).toBe(2);
    expect(c?.props).toEqual([
      { name: "id", type: null, optional: false, default: null, variants: null },
      { name: "variant", type: '"a" | "b"', optional: true, default: null, variants: ["a", "b"] },
    ]);
  });

  it("summarizes zones as per-kind counts with every kind always present", () => {
    const m = buildManifest(
      graph({ zones: { byFile: { "a.ts": "app", "b.ts": "app", "t.ts": "test" } } }),
      { version: "1.0.0" },
    );
    expect(m.zones.app).toBe(2);
    expect(m.zones.test).toBe(1);
    expect(m.zones["ds-source"]).toBe(0);
  });

  it("aggregates usage by kind (files + count), never per-file", () => {
    const m = buildManifest(
      graph({
        usage: [
          { file: "a.ts", kind: "imports-ds-module", count: 2 },
          { file: "b.ts", kind: "imports-ds-module", count: 5 },
        ],
      }),
      { version: "1.0.0" },
    );
    expect(m.usage).toEqual([{ kind: "imports-ds-module", files: 2, count: 7 }]);
  });

  it("always surfaces extraction status + remediation (degradation is a hard contract)", () => {
    const m = buildManifest(
      graph({
        extraction: {
          entries: [
            { extractor: "stories", status: "degraded", evidence: { storyFiles: 140 }, remediation: "run 'lyse init'" },
          ],
          conflicts: [{ axis: "colors", value: "#111111", tokenIds: ["a", "b"], sources: ["dtcg", "scss-variable"] }],
        },
      }),
      { version: "1.0.0" },
    );
    expect(m.extraction.entries[0]).toEqual({
      extractor: "stories",
      status: "degraded",
      evidence: { storyFiles: 140 },
      remediation: "run 'lyse init'",
    });
    expect(m.extraction.conflicts[0]?.tokenIds).toEqual(["a", "b"]);
  });

  it("carries a tokenSetHash that moves with token values only", () => {
    const a = buildManifest(graph({ tokens: [{ id: "c.a", axis: "colors", rawValue: "#111111", source: "dtcg" }] }), { version: "1.0.0" });
    const b = buildManifest(graph({ tokens: [{ id: "c.a", axis: "colors", rawValue: "#222222", source: "dtcg" }] }), { version: "1.0.0" });
    const c = buildManifest(
      graph({
        tokens: [{ id: "c.a", axis: "colors", rawValue: "#111111", source: "dtcg" }],
        usage: [{ file: "x.ts", kind: "imports-ds-module", count: 1 }],
      }),
      { version: "1.0.0" },
    );
    expect(a.tokenSetHash).not.toBe(b.tokenSetHash);
    expect(a.tokenSetHash).toBe(c.tokenSetHash);
  });
});
