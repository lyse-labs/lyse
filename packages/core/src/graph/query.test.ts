import { describe, it, expect } from "vitest";
import { zoneOf, isScoredZone, isScored, onScale, reverseLookup } from "./query.js";
import type { DesignSystemGraph } from "./types.js";

const graph: DesignSystemGraph = {
  schemaVersion: 1,
  tokens: [
    { id: "spacing.4", axis: "spacing", rawValue: "16", source: "dtcg" },
    { id: "spacing.alt", axis: "spacing", rawValue: "16", source: "css-custom-property" },
    { id: "color.primary", axis: "colors", rawValue: "#2563eb", source: "dtcg" },
  ],
  components: [], stories: [], usage: [],
  zones: { byFile: { "src/app/Button.tsx": "app", "registry/ui/button.tsx": "ds-source" } },
  extraction: { entries: [], conflicts: [] },
};

describe("graph/query", () => {
  it("zoneOf defaults absent files to app", () => {
    expect(zoneOf(graph, "src/app/Button.tsx")).toBe("app");
    expect(zoneOf(graph, "registry/ui/button.tsx")).toBe("ds-source");
    expect(zoneOf(graph, "unknown/file.tsx")).toBe("app");
  });
  it("isScoredZone / isScored: only app is scored", () => {
    expect(isScoredZone("app")).toBe(true);
    expect(isScoredZone("ds-source")).toBe(false);
    expect(isScored(graph, "registry/ui/button.tsx")).toBe(false);
    expect(isScored(graph, "src/app/Button.tsx")).toBe(true);
  });
  it("onScale reads the fused token set", () => {
    expect(onScale(graph, "spacing", "16")).toBe(true);
    expect(onScale(graph, "spacing", "13")).toBe(false);
  });
  it("reverseLookup returns sorted matching token ids", () => {
    expect(reverseLookup(graph, "spacing", "16")).toEqual(["spacing.4", "spacing.alt"]);
    expect(reverseLookup(graph, "colors", "#2563eb")).toEqual(["color.primary"]);
    expect(reverseLookup(graph, "colors", "#000000")).toEqual([]);
  });
});
