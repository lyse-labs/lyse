import { createHash } from "node:crypto";
import type { DesignSystemGraph } from "../graph/types.js";

// Baseline staleness is defined against the design system a baseline describes:
// its token scale AND its component set. `usage` (per-file edges) is still
// excluded — it changes on almost every commit, so hashing it would fire the
// "baseline may be stale" warning on every PR and train users to ignore it.
//
// Components are included by IDENTITY only (sorted ids), never by content. That
// is deliberately coarse: it fires when the design system gains, loses or renames
// a component — the cases where a baseline no longer describes the same system —
// and stays silent while components are merely edited. Hashing only tokens meant
// `rm -rf src/components` left the hash untouched, so deleting an entire design
// system passed the diff-first gate with no staleness signal at all.
export function computeGraphHash(graph: DesignSystemGraph): string {
  const tokenRows = graph.tokens.map((t) => JSON.stringify(["t", t.id, t.axis, t.rawValue]));
  const componentRows = graph.components.map((c) => JSON.stringify(["c", c.module, c.name]));
  const rows = [...tokenRows, ...componentRows];
  rows.sort();
  const hex = createHash("sha256").update(rows.join("\n")).digest("hex");
  return `sha256:${hex}`;
}
