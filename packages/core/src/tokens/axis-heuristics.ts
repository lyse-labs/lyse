/**
 * Path-based axis heuristics for DTCG token types that several axes share.
 *
 * `dimension` and `number` each name a value shape, not an axis: a `dimension`
 * is a radius, a border width, a breakpoint or a spacing step depending only on
 * what the token is CALLED, and a `number` is a z-index or an opacity for the
 * same reason. Two places have to make that call —
 * `graph/extract/tokens.ts#axisFor` (the Design System Graph, which the value
 * resolver reads) and `loaders/tokens.ts#fromDtcg` (the flat TokenMap) — and
 * they must agree, or the same token means a different axis depending on which
 * file format declared it. They were previously two copies held in lockstep by
 * a comment; this module is the single source of truth.
 *
 * The ONE deliberate difference between the callers is `allowZPrefix`, and it
 * is a parameter rather than a divergence: `tokens/normalizer.ts#normalizeCssVars`
 * splits a CSS custom property on `-`, so the idiomatic `--z-modal` (the same
 * prefix Tailwind v4 uses) becomes the path `z/modal`, which `z.?index` does not
 * match. A DTCG document nests its own groups and does not go through that
 * split, so `fromDtcg` never opted in — see `AXIS_PATH_PATTERNS.zPrefix`.
 */

import type { TokenAxis } from "../graph/types.js";

/** The raw path patterns, exported so tests can assert on them directly. */
export const AXIS_PATH_PATTERNS = {
  radius: /radius/i,
  borderWidth: /border.?width/i,
  breakpoint: /breakpoint|screen/i,
  zIndex: /z.?index/i,
  /**
   * Only ever consulted with `allowZPrefix: true`. The trailing `/` anchor keeps
   * it from swallowing unrelated `z`-initial names like `zoom/level`.
   */
  zPrefix: /^z(\/|$)/i,
  opacity: /opacity/i,
} as const;

/**
 * Which axis a DTCG `dimension` token belongs to. Always answers: `spacing` is
 * the default target, which is why a mis-typed dimension token lands there.
 */
export function dimensionAxisForPath(
  tokenPath: string,
): Extract<TokenAxis, "radii" | "borderWidth" | "breakpoints" | "spacing"> {
  if (AXIS_PATH_PATTERNS.radius.test(tokenPath)) return "radii";
  if (AXIS_PATH_PATTERNS.borderWidth.test(tokenPath)) return "borderWidth";
  if (AXIS_PATH_PATTERNS.breakpoint.test(tokenPath)) return "breakpoints";
  return "spacing";
}

/**
 * Which axis a DTCG `number` token belongs to, or `undefined` when the path
 * names neither — unlike `dimension` there is no sensible default axis for a
 * bare number, so it is dropped rather than guessed at.
 *
 * @param allowZPrefix accept a leading `z/` path segment as z-index. True only
 * for the graph, whose CSS-custom-property paths are produced by splitting
 * `--z-modal` on `-`; see this module's docstring.
 */
export function numberAxisForPath(
  tokenPath: string,
  opts: { allowZPrefix: boolean },
): Extract<TokenAxis, "zIndex" | "opacity"> | undefined {
  if (AXIS_PATH_PATTERNS.zIndex.test(tokenPath)) return "zIndex";
  if (opts.allowZPrefix && AXIS_PATH_PATTERNS.zPrefix.test(tokenPath)) return "zIndex";
  if (AXIS_PATH_PATTERNS.opacity.test(tokenPath)) return "opacity";
  return undefined;
}
