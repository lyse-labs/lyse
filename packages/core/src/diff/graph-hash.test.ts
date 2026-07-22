import { describe, it, expect } from "vitest";
import { computeGraphHash } from "./graph-hash.js";
import type { DesignSystemGraph } from "../graph/types.js";

function emptyGraph(): DesignSystemGraph {
  return {
    schemaVersion: 1, tokens: [], components: [], stories: [], usage: [],
    zones: { rules: [] } as unknown as DesignSystemGraph["zones"],
    extraction: {} as unknown as DesignSystemGraph["extraction"],
  };
}

describe("computeGraphHash", () => {
  it("is deterministic for identical graphs", () => {
    expect(computeGraphHash(emptyGraph())).toBe(computeGraphHash(emptyGraph()));
  });
  it("has the sha256: prefix", () => {
    expect(computeGraphHash(emptyGraph())).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
  it("changes when a token is added", () => {
    const g = emptyGraph();
    const g2 = { ...g, tokens: [{ id: "color.brand", axis: "color", rawValue: "#000" } as unknown as DesignSystemGraph["tokens"][number]] };
    expect(computeGraphHash(g)).not.toBe(computeGraphHash(g2));
  });
});
