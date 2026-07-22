import { createHash } from "node:crypto";
import { serializeGraph } from "../graph/persist.js";
import type { DesignSystemGraph } from "../graph/types.js";

export function computeGraphHash(graph: DesignSystemGraph): string {
  const hex = createHash("sha256").update(serializeGraph(graph, { full: true })).digest("hex");
  return `sha256:${hex}`;
}
