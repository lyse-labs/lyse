import type { Resolver } from "../../graph/resolve/index.js";
import type { TokenNode, TokenAxis } from "../../graph/types.js";
import { parseColor } from "../../a11y/contrast.js";
import { numericValue } from "../../graph/resolve/scales.js";
import { isTrivialColor } from "../../graph/resolve/trivial-color.js";

const toHex = (r: number, g: number, b: number): string =>
  "#" + [r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("");

/** Deterministic channel nudges, smallest first, then larger for `novel`. */
const COLOR_NUDGES = [1, 2, 3, 5, 8, 13, 21, 34, 60, 100, 160];

function colorCandidates(hex: string): string[] {
  const c = parseColor(hex);
  if (!c) return [];
  const out: string[] = [];
  for (const d of COLOR_NUDGES) {
    out.push(toHex(c.r + d, c.g, c.b));
    out.push(toHex(c.r - d, c.g + d, c.b));
  }
  return out;
}

const NUM_NUDGES = [1, 2, 3, 4, 6, 9, 15, 40, 100];

/** Loader strips px off spacing-family axes; the canonical CSS literal for those tokens is px. */
const AXIS_DEFAULT_UNIT: Partial<Record<TokenAxis, string>> = {
  spacing: "px",
  radii: "px",
  borderWidth: "px",
  breakpoints: "px",
};

export function generateLiterals(
  resolver: Resolver,
  tokens: TokenNode[],
  axis: TokenAxis,
  cls: "exact" | "near" | "novel",
  cap: number,
): string[] {
  const onAxis = tokens.filter((t) => t.axis === axis).slice().sort((a, b) => (a.id < b.id ? -1 : 1));
  const out: string[] = [];
  const push = (v: string): boolean => {
    if (out.includes(v)) return false;
    if (resolver.resolve(axis, v).class !== cls) return false;
    out.push(v);
    return out.length >= cap;
  };

  for (const t of onAxis) {
    if (out.length >= cap) break;
    if (axis === "colors") {
      if (cls === "exact") {
        if (isTrivialColor(t.rawValue)) continue; // trivial tokens are suppressed → not real drift
        if (push(t.rawValue.toLowerCase())) break;
      } else {
        for (const cand of colorCandidates(t.rawValue)) if (push(cand)) break;
      }
    } else {
      const n = numericValue(t.rawValue);
      if (n === null) continue;
      if (cls === "exact") { if (push(t.rawValue)) break; }
      else {
        const derivedUnit = t.rawValue.replace(/^[+-]?[\d.]+/, "");
        const unit = derivedUnit || AXIS_DEFAULT_UNIT[axis] || "";
        for (const d of NUM_NUDGES) { if (push(`${n + d}${unit}`) || push(`${Math.max(0, n - d)}${unit}`)) break; }
      }
    }
  }
  return out;
}
