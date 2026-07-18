import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serializeGraph, writeGraph } from "./persist.js";
import type { DesignSystemGraph } from "./types.js";

const graph = (): DesignSystemGraph => ({
  schemaVersion: 1,
  tokens: [{ id: "color/brand", axis: "colors", rawValue: "#3b82f6", source: "dtcg" }],
  components: [],
  stories: [],
  usage: [{ file: "src/App.tsx", kind: "imports-ds-module", count: 1 }],
  zones: { byFile: { "src/App.tsx": "app" } },
  extraction: { entries: [{ extractor: "tokens", status: "ok", evidence: { tokenNodes: 1 }, remediation: null }], conflicts: [] },
});

describe("serializeGraph", () => {
  it("is byte-identical across two calls (determinism) and ends with a newline", () => {
    const a = serializeGraph(graph());
    const b = serializeGraph(graph());
    expect(a).toBe(b);
    expect(a.endsWith("\n")).toBe(true);
    expect(JSON.parse(a).$schema).toContain("graph");
  });
  it("drops usage by default, keeps it under { full: true }", () => {
    expect(JSON.parse(serializeGraph(graph())).usage).toBeUndefined();
    expect(JSON.parse(serializeGraph(graph(), { full: true })).usage).toHaveLength(1);
  });
  it("sorts object keys deeply (deterministic)", () => {
    const parsed = JSON.parse(serializeGraph(graph()));
    expect(Object.keys(parsed)).toEqual([...Object.keys(parsed)].sort());
  });
});

describe("writeGraph", () => {
  it("writes .lyse/graph.json under the repo root", () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-persist-"));
    writeGraph(root, graph());
    const p = join(root, ".lyse", "graph.json");
    expect(existsSync(p)).toBe(true);
    expect(readFileSync(p, "utf8")).toBe(serializeGraph(graph()));
  });
});
