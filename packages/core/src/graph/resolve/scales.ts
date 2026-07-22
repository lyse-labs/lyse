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

export interface DerivedScale {
  scale: number[];
  /**
   * True when NO token on the axis yielded a numeric value, so `scale` is the
   * built-in default (or empty for an axis that has none). Callers need this to
   * tell "on the scale, anchored by a token" from "on the scale, but no token
   * anchors it" — the fallback scale still knows the answer, it just has no
   * token id to name. This flag is the single source of truth for that
   * condition: deriving it independently (e.g. "does the axis have any token")
   * diverges here, because a token whose value is non-numeric (`auto`) counts
   * for that test but not for this one.
   */
  isFallback: boolean;
}

export function deriveScaleInfo(graph: DesignSystemGraph, axis: TokenAxis): DerivedScale {
  const own: number[] = [];
  for (const t of graph.tokens) {
    if (t.axis !== axis) continue;
    const n = numericValue(t.rawValue);
    if (n !== null) own.push(n);
  }
  if (own.length > 0) {
    return {
      scale: [...new Set(own)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
      isFallback: false,
    };
  }
  return { scale: [...(DEFAULT_SCALES[axis] ?? [])], isFallback: true };
}

export function deriveScale(graph: DesignSystemGraph, axis: TokenAxis): number[] {
  return deriveScaleInfo(graph, axis).scale;
}

/**
 * Distance from `value` to the scale, expressed in scale positions (0 = the
 * value IS on the scale). `Number.POSITIVE_INFINITY` means "no answer" — the
 * caller must not read it as a large-but-real distance.
 *
 * PRECONDITION: `scale` must be sorted ascending (as deriveScale returns it) —
 * neighbour lookups by index assume that order.
 */
export function stepDistance(scale: readonly number[], value: number): number {
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

  // Fewer than two entries: the axis has NO observable step unit, so there is
  // no honest way to say how far off the scale a value is. An earlier version
  // used the single entry's own magnitude as the gap unit, which put every
  // value in (0, 2×entry) exactly one step away — a repo whose only z-index
  // token is `700` got "probably `zIndex/modal` — verify before replacing"
  // (warning/medium) for `z-index: 33`. That is a confident, wrong claim.
  // Returning Infinity keeps such values in the advisory `novel` class; an
  // exact hit still returns 0 above, so a one-token scale can still resolve
  // `exact`.
  if (scale.length < 2) return Number.POSITIVE_INFINITY;

  const nearest = scale[nearestIndex];
  if (nearest === undefined) return Number.POSITIVE_INFINITY;

  // Express the gap in scale positions: how many adjacent-entry gaps of the
  // local scale granularity fit inside the distance to the nearest entry.
  // With two or more entries at least one neighbour always exists.
  const lower = scale[nearestIndex - 1];
  const upper = scale[nearestIndex + 1];
  let localGap: number;
  if (value > nearest && upper !== undefined) {
    localGap = Math.abs(upper - nearest);
  } else if (value < nearest && lower !== undefined) {
    localGap = Math.abs(nearest - lower);
  } else {
    localGap = Math.abs((upper ?? lower ?? nearest) - nearest);
  }

  if (!Number.isFinite(localGap) || localGap === 0) return 1;
  return Math.max(1, Math.ceil(nearestDelta / localGap));
}
