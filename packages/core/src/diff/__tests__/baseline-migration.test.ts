import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readBaseline, buildBaseline, CURRENT_BASELINE_SCHEMA } from "../baseline.js";
import { selectNew } from "../delta.js";
import type { AuditResult } from "../../types.js";
import type { DesignSystemGraph } from "../../graph/types.js";

function graph(components: Array<{ name: string; module: string }>): DesignSystemGraph {
  return {
    schemaVersion: 1,
    tokens: [],
    components: components.map((c) => ({
      name: c.name,
      file: null,
      module: c.module,
      exportKind: "named" as const,
    })) as DesignSystemGraph["components"],
    stories: [],
    usage: [],
    zones: { byFile: {} },
    extraction: { entries: [], conflicts: [] },
  };
}

const result = { findings: [], axes: [] } as unknown as AuditResult;

function write(dir: string, body: unknown): string {
  const p = join(dir, "baseline.json");
  writeFileSync(p, JSON.stringify(body), "utf8");
  return p;
}

describe("baseline schema migration", () => {
  const dir = mkdtempSync(join(tmpdir(), "lyse-baseline-"));

  it("stamps the current schema version when writing", () => {
    expect(buildBaseline(result, graph([])).schemaVersion).toBe(CURRENT_BASELINE_SCHEMA);
    expect(CURRENT_BASELINE_SCHEMA).toBeGreaterThan(1);
  });

  it("still reads a v1 baseline written by an older Lyse", () => {
    const p = write(dir, {
      schemaVersion: 1,
      graphHash: "sha256:whatever-the-old-formula-produced",
      scores: { tokens: 90 },
      findings: {},
    });
    expect(() => readBaseline(p)).not.toThrow();
    expect(readBaseline(p).schemaVersion).toBe(1);
  });

  it("does NOT call a v1 baseline stale — the hash formula changed, the repo did not", () => {
    // Upgrading Lyse must not turn a green CI red on a tree nobody touched.
    const p = write(dir, {
      schemaVersion: 1,
      graphHash: "sha256:computed-by-the-previous-formula",
      scores: {},
      findings: {},
    });
    const { staleGraph } = selectNew([], readBaseline(p), graph([{ name: "Button", module: "@acme/ui" }]));
    expect(staleGraph).toBe(false);
  });

  it("still detects a genuinely stale baseline written by this version", () => {
    const before = buildBaseline(result, graph([{ name: "Button", module: "@acme/ui" }]));
    const p = write(dir, before);
    const { staleGraph } = selectNew([], readBaseline(p), graph([]));
    expect(staleGraph).toBe(true);
  });
});
