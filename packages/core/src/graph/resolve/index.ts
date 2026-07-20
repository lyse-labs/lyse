import type { DesignSystemGraph, TokenAxis } from "../types.js";
import type { Resolution, Resolver, ResolverConfig } from "./types.js";
import { srgbToOklab, deltaEOk, type Oklab } from "./oklab.js";
import { deriveScale, stepDistance, numericValue, NUMERIC_AXES } from "./scales.js";
import { parseColor } from "../../a11y/contrast.js";

export type { Resolution, Resolver, ResolverConfig, ResolveClass } from "./types.js";

// ΔEOK's just-noticeable difference is ≈0.02. This is NOT CIELAB's ΔE≈2.3 scale —
// using a CIELAB-sized threshold here would classify every color as `near`.
export const DEFAULT_RESOLVER_CONFIG: ResolverConfig = {
  colorNearThreshold: 0.02,
  dimensionNearSteps: 1,
};

// Mirrors graph/extract/tokens.ts: a NUL can't appear in an axis name or a raw
// token value, so it is a collision-proof join delimiter. Built via fromCharCode
// to keep a raw control byte out of this source file.
const KEY_DELIMITER = String.fromCharCode(0);

const UNRESOLVED: Resolution = { class: "unresolved", tokenIds: [] };
const NOVEL: Resolution = { class: "novel", tokenIds: [] };

interface ColorEntry {
  id: string;
  lab: Oklab;
  alpha: number;
}

function sortIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function createResolver(
  graph: DesignSystemGraph,
  config: Partial<ResolverConfig> = {},
): Resolver {
  const cfg: ResolverConfig = { ...DEFAULT_RESOLVER_CONFIG, ...config };

  const exactIndex = new Map<string, string[]>();
  for (const t of graph.tokens) {
    const key = `${t.axis}${KEY_DELIMITER}${t.rawValue}`;
    const list = exactIndex.get(key);
    if (list) list.push(t.id);
    else exactIndex.set(key, [t.id]);
  }

  const colorEntries: ColorEntry[] = [];
  for (const t of graph.tokens) {
    if (t.axis !== "colors") continue;
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

  function classify(axis: TokenAxis, rawValue: string): Resolution {
    const exact = exactIndex.get(`${axis}${KEY_DELIMITER}${rawValue}`);
    if (exact) return { class: "exact", tokenIds: sortIds(exact) };

    if (axis === "colors") {
      const parsed = parseColor(rawValue);
      if (!parsed) return UNRESOLVED;
      const lab = srgbToOklab(parsed);
      let best: { id: string; d: number } | null = null;
      for (const entry of colorEntries) {
        if (entry.alpha !== parsed.a) continue;
        const d = deltaEOk(lab, entry.lab);
        if (best === null || d < best.d || (d === best.d && entry.id < best.id)) {
          best = { id: entry.id, d };
        }
      }
      if (best !== null && best.d <= cfg.colorNearThreshold) {
        return { class: "near", tokenIds: [best.id], distance: best.d };
      }
      return NOVEL;
    }

    if (NUMERIC_AXES.includes(axis)) {
      // Use the shared helper from scales.ts — it strips units (4px, 1rem),
      // normalises `duration/` to milliseconds and rejects `easing/`. Re-deriving
      // this inline with a bare Number.parseFloat silently drops most real token
      // values (the Task 2 review caught exactly that).
      const n = numericValue(rawValue);
      if (n === null) return UNRESOLVED;
      const scale = scaleFor(axis);
      const steps = stepDistance(scale, n);
      if (steps === Number.POSITIVE_INFINITY) return NOVEL;
      if (steps <= cfg.dimensionNearSteps) {
        const nearestIds: string[] = [];
        let bestDelta = Number.POSITIVE_INFINITY;
        for (const entry of scale) {
          const delta = Math.abs(entry - n);
          if (delta < bestDelta) bestDelta = delta;
        }
        for (const t of graph.tokens) {
          if (t.axis !== axis) continue;
          const tv = numericValue(t.rawValue);
          if (tv !== null && Math.abs(tv - n) === bestDelta) nearestIds.push(t.id);
        }
        if (nearestIds.length > 0) {
          return { class: "near", tokenIds: sortIds(nearestIds), distance: steps };
        }
      }
      return NOVEL;
    }

    return NOVEL;
  }

  return {
    resolve(axis, rawValue) {
      const key = `${axis}${KEY_DELIMITER}${rawValue}`;
      const cached = memo.get(key);
      if (cached) return cached;
      const result = classify(axis, rawValue);
      memo.set(key, result);
      if (result.class === "unresolved") unresolvedKeys.add(key);
      return result;
    },
    abstentions() {
      return unresolvedKeys.size;
    },
  };
}
