import { describe, it, expect } from "vitest";
import type { DesignSystemGraph } from "../graph/types.js";
import { buildManifest } from "./build.js";
import { serializeManifest } from "./serialize.js";

function graph(tokens: DesignSystemGraph["tokens"]): DesignSystemGraph {
  return {
    schemaVersion: 1,
    tokens,
    components: [],
    stories: [],
    usage: [],
    zones: { byFile: {} },
    extraction: { entries: [], conflicts: [] },
  };
}

describe("serializeManifest", () => {
  it("emits sorted keys, a $schema URL and a trailing newline", () => {
    const json = serializeManifest(buildManifest(graph([]), { version: "1.0.0" }));
    expect(json.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed["$schema"]).toContain("lyse-manifest.json");
    expect(Object.keys(parsed)).toEqual([...Object.keys(parsed)].sort());
  });

  it("is byte-identical regardless of source token insertion order", () => {
    const a = serializeManifest(
      buildManifest(
        graph([
          { id: "color.a", axis: "colors", rawValue: "#111111", source: "dtcg" },
          { id: "color.b", axis: "colors", rawValue: "#222222", source: "dtcg" },
        ]),
        { version: "1.0.0" },
      ),
    );
    const b = serializeManifest(
      buildManifest(
        graph([
          { id: "color.b", axis: "colors", rawValue: "#222222", source: "dtcg" },
          { id: "color.a", axis: "colors", rawValue: "#111111", source: "dtcg" },
        ]),
        { version: "1.0.0" },
      ),
    );
    expect(a).toBe(b);
  });
});
