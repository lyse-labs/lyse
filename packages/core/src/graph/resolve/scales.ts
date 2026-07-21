import type { DesignSystemGraph, TokenAxis } from "../types.js";

// Tailwind's default spacing scale, expressed in px (step n = n × 4px, so
// step 4 = 16px) rather than Tailwind's own step numbers — this must stay in
// the same unit as numericValue's output (px), which is why it's ×4 vs. the
// step list you'd find in Tailwind's docs.
export const DEFAULT_SPACING_SCALE: readonly number[] = [
  0, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 56,
  64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224, 240, 256, 288, 320, 384,
];

export const NUMERIC_AXES: readonly TokenAxis[] = [
  "spacing", "radii", "borderWidth", "zIndex", "opacity", "breakpoints", "motion",
];

const DEFAULT_SCALES: Partial<Record<TokenAxis, readonly number[]>> = {
  spacing: DEFAULT_SPACING_SCALE,
};

// Both patterns are anchored end-to-end and carry an explicit unit allow-list.
// An unanchored parse would silently coerce a relative value onto an absolute
// scale — `--radius-full: 50%` next to `--radius-sm: 4px` would derive [4, 50],
// putting a percentage and a pixel count on the same axis. normalizer.ts types
// %, vh, vw, ch, ex, pt, pc, cm, mm and in as dimensions too, so rejecting
// anything outside the allow-list is the only safe default.
const DIMENSION_VALUE = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em)?$/;
const DURATION_VALUE = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:ms|s)?$/;

/**
 * WHY: graph raw values are not uniformly bare numbers — only `spacing` is
 * px-stripped upstream, and `motion` carries a `duration/` or `easing/` prefix
 * (see graph/extract/tokens.ts#canonicalRawValue).
 *
 * Lengths normalize to px, assuming a 16px root font size: `rem`/`em` are
 * multiplied by 16, `px` and unitless (graph dimension values are already
 * px-stripped upstream, so unitless already means px) pass through unchanged.
 * 16px is the CSS default and near-universal in real stylesheets, so this is
 * the right default assumption — without it, a scale authored in rem (e.g.
 * `--space-1: 0.25rem`) never matches code that uses the equivalent px value
 * (`padding: 4px`), silently under-reporting real drift as `novel` instead of
 * `exact`. A repo that overrides the root font size will see its rem/em
 * tokens land a fixed offset away from matching px code — that surfaces as
 * the advisory `near`/`novel` classes, never as a false `exact`, so the
 * blast radius of the assumption being wrong is bounded by the class system.
 */
export function numericValue(rawValue: string): number | null {
  const v = rawValue.trim().toLowerCase();
  if (v.startsWith("easing/")) return null;

  const duration = v.startsWith("duration/");
  const body = duration ? v.slice("duration/".length) : v;

  if (!(duration ? DURATION_VALUE : DIMENSION_VALUE).test(body)) return null;
  const n = Number.parseFloat(body);
  if (!Number.isFinite(n)) return null;

  // Durations are normalised to milliseconds so `0.2s` and `200ms` compare equal.
  if (duration) return body.endsWith("ms") ? n : body.endsWith("s") ? n * 1000 : n;

  // Lengths normalise to px at a 16px root. `"1rem".endsWith("em")` is true,
  // so this single check already catches both suffixes — and both need the
  // same ×16, so there is no ordering hazard to get wrong.
  if (body.endsWith("em")) return n * 16;
  return n; // px suffix or unitless — already px.
}

export function deriveScale(graph: DesignSystemGraph, axis: TokenAxis): number[] {
  const own: number[] = [];
  for (const t of graph.tokens) {
    if (t.axis !== axis) continue;
    const n = numericValue(t.rawValue);
    if (n !== null) own.push(n);
  }
  if (own.length > 0) {
    return [...new Set(own)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }
  return [...(DEFAULT_SCALES[axis] ?? [])];
}

// PRECONDITION: `scale` must be sorted ascending (as deriveScale returns it) —
// neighbour lookups by index assume that order.
export function stepDistance(scale: readonly number[], value: number): number {
  if (scale.length === 0) return Number.POSITIVE_INFINITY;

  let nearestIndex = 0;
  let nearestDelta = Number.POSITIVE_INFINITY;
  for (let i = 0; i < scale.length; i++) {
    const entry = scale[i];
    if (entry === undefined) continue;
    const delta = Math.abs(entry - value);
    if (delta < nearestDelta) {
      nearestDelta = delta;
      nearestIndex = i;
    }
  }
  if (nearestDelta === 0) return 0;

  const nearest = scale[nearestIndex];
  if (nearest === undefined) return Number.POSITIVE_INFINITY;

  // Express the gap in scale positions: how many adjacent-entry gaps of the
  // local scale granularity fit inside the distance to the nearest entry.
  const lower = scale[nearestIndex - 1];
  const upper = scale[nearestIndex + 1];
  let localGap: number;
  if (value > nearest && upper !== undefined) {
    localGap = Math.abs(upper - nearest);
  } else if (value < nearest && lower !== undefined) {
    localGap = Math.abs(nearest - lower);
  } else if (upper !== undefined || lower !== undefined) {
    localGap = Math.abs((upper ?? lower ?? nearest) - nearest);
  } else {
    // Single-entry scale: no adjacent gap to measure against. Fall back to
    // the entry's own magnitude as the gap unit so the distance still grows
    // with |value - nearest| instead of pinning at 1; guard against 0 (which
    // would otherwise divide by zero / never grow).
    localGap = Math.abs(nearest) || 1;
  }

  if (!Number.isFinite(localGap) || localGap === 0) return 1;
  return Math.max(1, Math.ceil(nearestDelta / localGap));
}
