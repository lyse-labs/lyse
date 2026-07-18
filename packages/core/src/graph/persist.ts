import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sortKeysDeep } from "../json-sort-keys.js";
import type { DesignSystemGraph } from "./types.js";

const GRAPH_SCHEMA_URL =
  "https://github.com/lyse-labs/lyse/raw/main/schemas/v1/lyse-graph.json";

export function serializeGraph(graph: DesignSystemGraph, opts: { full?: boolean } = {}): string {
  const { usage, ...rest } = graph;
  const body: Record<string, unknown> = opts.full ? { ...rest, usage } : { ...rest };
  const withSchema = { $schema: GRAPH_SCHEMA_URL, ...body };
  return JSON.stringify(sortKeysDeep(withSchema), null, 2) + "\n";
}

export function writeGraph(
  repoRoot: string,
  graph: DesignSystemGraph,
  opts: { full?: boolean } = {},
): void {
  const dir = join(repoRoot, ".lyse");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "graph.json"), serializeGraph(graph, opts));
}
