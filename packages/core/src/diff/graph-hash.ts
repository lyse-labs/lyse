import { createHash } from "node:crypto";
import type { DesignSystemGraph } from "../graph/types.js";

// Baseline staleness is defined against the thing drift is measured AGAINST — the
// design system's token scale — not the code that consumes it. `usage` (per-file
// edges) changes on almost every commit, so hashing it would fire the "baseline
// may be stale" warning on every PR and train users to ignore it, defeating
// diff-first. `components` / `stories` / `zones` are deliberately excluded too for
// now: the token set (id + axis + rawValue) is what the resolver classifies values
// against. This is a choice, not an omission — widen it only if a non-token part of
// the graph starts changing a value's drift class.
export function computeGraphHash(graph: DesignSystemGraph): string {
  const rows = graph.tokens.map((t) => JSON.stringify([t.id, t.axis, t.rawValue]));
  rows.sort();
  const hex = createHash("sha256").update(rows.join("\n")).digest("hex");
  return `sha256:${hex}`;
}
