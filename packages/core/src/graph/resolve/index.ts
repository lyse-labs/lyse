import type { DesignSystemGraph, TokenAxis, TokenNode } from "../types.js";
import type { Resolution, Resolver, ResolverConfig } from "./types.js";
import { srgbToOklab, deltaEOk, type Oklab } from "./oklab.js";
import { deriveScale, stepDistance, numericValue, NUMERIC_AXES } from "./scales.js";
import { parseColor } from "../../a11y/contrast.js";

export type { Resolution, Resolver, ResolverConfig, ResolveClass } from "./types.js";

// ΔEOK's just-noticeable difference is ≈0.02. This is NOT CIELAB's ΔE≈2.3 scale —
// using a CIELAB-sized threshold here would classify every color as `near`.
// Frozen: this object is exported, so a consumer mutating it would silently
// re-tune every resolver in the process.
export const DEFAULT_RESOLVER_CONFIG: Readonly<ResolverConfig> = Object.freeze({
  colorNearThreshold: 0.02,
  dimensionNearSteps: 1,
});

// Mirrors graph/extract/tokens.ts: a NUL can't appear in an axis name or a raw
// token value, so it is a collision-proof join delimiter. Built via fromCharCode
// to keep a raw control byte out of this source file.
const KEY_DELIMITER = String.fromCharCode(0);

// 8-bit alpha channels round-trip through hex (`#rrggbbaa`), so `0.5` arrives as
// 0x80/255 = 0.50196…. Comparing alpha with `===` would call that a mismatch.
const ALPHA_TOLERANCE = 1 / 255;

// A literal that is a token reference or a CSS-wide keyword carries no design
// value to compare: reporting it as `novel` is information noise, not drift.
const OPAQUE_KEYWORDS = new Set([
  "inherit", "initial", "unset", "revert", "none", "auto", "currentcolor",
]);

interface ColorEntry {
  id: string;
  lab: Oklab;
  alpha: number;
}

function sortIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function unresolved(): Resolution {
  return { class: "unresolved", tokenIds: [] };
}

function novel(): Resolution {
  return { class: "novel", tokenIds: [] };
}

/** Callers get their own copy: a mutated result must never leak into the memo. */
function copyOf(r: Resolution): Resolution {
  return r.distance === undefined
    ? { class: r.class, tokenIds: [...r.tokenIds] }
    : { class: r.class, tokenIds: [...r.tokenIds], distance: r.distance };
}

/**
 * WHY: graph token values are canonicalised per axis upstream
 * (graph/extract/tokens.ts#canonicalRawValue) while a literal arrives exactly as
 * written in source. Composite axes bridge that gap by comparing on a normalised
 * form — lowercased, trimmed, whitespace-collapsed, `easing/` prefix dropped.
 */
function normalizeComposite(value: string): string {
  const v = value.trim().toLowerCase().replace(/\s+/g, " ");
  return v.startsWith("easing/") ? v.slice("easing/".length).trim() : v;
}

/**
 * Motion literals arrive either graph-canonical (`duration/200ms`, `easing/…`)
 * or as written in source (`200ms`, `0.2s`, `cubic-bezier(…)`). Only durations
 * are numeric; anything else falls through to the composite path.
 */
function motionDuration(rawValue: string): number | null {
  const v = rawValue.trim().toLowerCase();
  if (v.startsWith("easing/")) return null;
  if (v.startsWith("duration/")) return numericValue(v);
  return numericValue(`duration/${v}`);
}

export function createResolver(
  graph: DesignSystemGraph,
  config: Partial<ResolverConfig> = {},
): Resolver {
  const cfg: ResolverConfig = { ...DEFAULT_RESOLVER_CONFIG, ...config };

  const byAxis = new Map<TokenAxis, TokenNode[]>();
  for (const t of graph.tokens) {
    const list = byAxis.get(t.axis);
    if (list) list.push(t);
    else byAxis.set(t.axis, [t]);
  }
  const tokensOn = (axis: TokenAxis): TokenNode[] => byAxis.get(axis) ?? [];

  const colorEntries: ColorEntry[] = [];
  for (const t of tokensOn("colors")) {
    const parsed = parseColor(t.rawValue);
    if (!parsed) continue;
    colorEntries.push({ id: t.id, lab: srgbToOklab(parsed), alpha: parsed.a });
  }

  const scaleCache = new Map<TokenAxis, number[]>();
  const scaleFor = (axis: TokenAxis): number[] => {
    let s = scaleCache.get(axis);
    if (!s) {
      s = deriveScale(graph, axis);
      scaleCache.set(axis, s);
    }
    return s;
  };

  const memo = new Map<string, Resolution>();
  const unresolvedKeys = new Set<string>();

  // Path 1 — perceptual. Both sides are parsed to OKLab, so `#3B82F6`,
  // `rgb(59, 130, 246)` and a `#3b82f6` token are the same color.
  function classifyColor(rawValue: string): Resolution {
    const parsed = parseColor(rawValue);
    if (!parsed) return unresolved();
    const lab = srgbToOklab(parsed);

    let bestDelta = Number.POSITIVE_INFINITY;
    let bestIds: string[] = [];
    for (const entry of colorEntries) {
      if (Math.abs(entry.alpha - parsed.a) > ALPHA_TOLERANCE) continue;
      const d = deltaEOk(lab, entry.lab);
      if (d < bestDelta) {
        bestDelta = d;
        bestIds = [entry.id];
      } else if (d === bestDelta) {
        bestIds.push(entry.id);
      }
    }

    if (bestIds.length === 0) return novel();
    if (bestDelta === 0) return { class: "exact", tokenIds: sortIds(bestIds) };
    if (bestDelta <= cfg.colorNearThreshold) {
      return { class: "near", tokenIds: sortIds(bestIds), distance: bestDelta };
    }
    return novel();
  }

  // Path 2 — numeric. Both sides go through `numericValue`, the single parse
  // path: it strips px/rem/em, normalises durations to milliseconds and rejects
  // easing curves. A string round-trip here would miss `16px` vs token `16`.
  function classifyNumeric(axis: TokenAxis, value: number): Resolution {
    let bestDelta = Number.POSITIVE_INFINITY;
    let bestIds: string[] = [];
    for (const t of tokensOn(axis)) {
      const tv = numericValue(t.rawValue);
      if (tv === null) continue;
      const delta = Math.abs(tv - value);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIds = [t.id];
      } else if (delta === bestDelta) {
        bestIds.push(t.id);
      }
    }

    if (bestDelta === 0 && bestIds.length > 0) {
      return { class: "exact", tokenIds: sortIds(bestIds) };
    }

    const steps = stepDistance(scaleFor(axis), value);
    if (steps <= cfg.dimensionNearSteps && bestIds.length > 0) {
      return { class: "near", tokenIds: sortIds(bestIds), distance: steps };
    }
    return novel();
  }

  // Path 3 — composite / string. Never returns `near`: there is no defensible
  // distance metric for a tuple like `0 1px 2px rgba(0,0,0,.1)`.
  function classifyComposite(axis: TokenAxis, rawValue: string): Resolution {
    const normalized = normalizeComposite(rawValue);
    if (
      normalized === "" ||
      normalized.startsWith("var(") ||
      normalized.startsWith("$") ||
      OPAQUE_KEYWORDS.has(normalized)
    ) {
      return unresolved();
    }

    const ids: string[] = [];
    for (const t of tokensOn(axis)) {
      if (normalizeComposite(t.rawValue) === normalized) ids.push(t.id);
    }
    return ids.length > 0 ? { class: "exact", tokenIds: sortIds(ids) } : novel();
  }

  function classify(axis: TokenAxis, rawValue: string): Resolution {
    if (axis === "colors") return classifyColor(rawValue);

    if (axis === "motion") {
      const ms = motionDuration(rawValue);
      return ms === null ? classifyComposite(axis, rawValue) : classifyNumeric(axis, ms);
    }

    if (NUMERIC_AXES.includes(axis)) {
      const n = numericValue(rawValue);
      return n === null ? unresolved() : classifyNumeric(axis, n);
    }

    return classifyComposite(axis, rawValue);
  }

  return {
    resolve(axis, rawValue) {
      const key = `${axis}${KEY_DELIMITER}${rawValue}`;
      let result = memo.get(key);
      if (!result) {
        result = classify(axis, rawValue);
        memo.set(key, result);
        if (result.class === "unresolved") unresolvedKeys.add(key);
      }
      return copyOf(result);
    },
    // Counts distinct (axis, value) pairs that were classified `unresolved`, not
    // the number of resolve() calls: repeats of the same pair count once.
    abstentions() {
      return unresolvedKeys.size;
    },
  };
}
