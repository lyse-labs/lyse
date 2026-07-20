import type { DesignSystemGraph, TokenAxis } from "../types.js";

export const DEFAULT_SPACING_SCALE: readonly number[] = [
  0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14,
  16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96,
];

export const NUMERIC_AXES: readonly TokenAxis[] = [
  "spacing", "radii", "borderWidth", "zIndex", "opacity", "breakpoints", "motion",
];

const DEFAULT_SCALES: Partial<Record<TokenAxis, readonly number[]>> = {
  spacing: DEFAULT_SPACING_SCALE,
};

export function deriveScale(graph: DesignSystemGraph, axis: TokenAxis): number[] {
  const own: number[] = [];
  for (const t of graph.tokens) {
    if (t.axis !== axis) continue;
    const n = Number.parseFloat(t.rawValue);
    if (Number.isFinite(n) && String(n) === t.rawValue.trim()) own.push(n);
  }
  if (own.length > 0) {
    return [...new Set(own)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }
  return [...(DEFAULT_SCALES[axis] ?? [])];
}

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
  const localGap =
    value > nearest && upper !== undefined
      ? Math.abs(upper - nearest)
      : value < nearest && lower !== undefined
        ? Math.abs(nearest - lower)
        : Math.abs((upper ?? lower ?? nearest) - nearest);

  if (!Number.isFinite(localGap) || localGap === 0) return 1;
  return Math.max(1, Math.ceil(nearestDelta / localGap));
}
