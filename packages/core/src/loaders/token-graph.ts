/**
 * token-graph.ts — Theme parity checker for light/dark mode token analysis.
 *
 * Detects light/dark token naming conventions and flags tokens that exist in one
 * mode but are missing in the other. This is a pure helper (no rule yet) — it
 * will be consumed by:
 *   - Sprint 1 Step 6: LLM prompt themes section (richer signal for Layer 4)
 *   - v0.2 planned rule: themes/parity-check
 *
 * Detection strategy (convention-based, NOT DTCG-mode-based):
 *   - Suffix pattern:   `<base>-light` / `<base>-dark`
 *   - Prefix pattern:   `light-<base>` / `dark-<base>`
 *   - Path segment:     tokens containing `/light/` and `/dark/` in their path
 *
 * For each base token detected, if only one mode variant exists, it is flagged
 * as missing in the opposite mode.
 *
 * Limitation: DTCG multi-mode overrides (using $modes / $extensions) are not
 * analysed in v0.1. These require the full DTCG tree, not just the flattened
 * TokenMap. Planned for v0.2.
 */

import type { TokenMap } from "../types.js";

export interface ThemeParityCheck {
  /** Token base names defined in light mode but missing in dark mode. */
  missingInDark: string[];
  /** Token base names defined in dark mode but missing in light mode. */
  missingInLight: string[];
  /** True when both light and dark mode tokens were detected in the TokenMap. */
  hasMultipleModes: boolean;
}

/**
 * All token paths from every map in the TokenMap, collected as a flat string array.
 * TokenMap maps are value → [tokenPaths], so we iterate values to get paths.
 */
function collectAllTokenPaths(tokenMap: TokenMap): string[] {
  const paths: string[] = [];
  const maps: Map<string, string[]>[] = [
    tokenMap.colors,
    tokenMap.spacing,
    tokenMap.typography,
    tokenMap.radii,
    tokenMap.shadows,
    tokenMap.motion,
    tokenMap.breakpoints,
    tokenMap.zIndex,
    tokenMap.opacity,
    tokenMap.borderWidth,
  ];
  for (const map of maps) {
    for (const tokenPaths of map.values()) {
      for (const p of tokenPaths) {
        paths.push(p);
      }
    }
  }
  return paths;
}

/**
 * Detect light/dark pairs using suffix pattern (`<base>-light` / `<base>-dark`).
 * Returns sets of base names found in each mode.
 */
function detectSuffixPattern(paths: string[]): { light: Set<string>; dark: Set<string> } | null {
  const lightBases = new Set<string>();
  const darkBases = new Set<string>();

  for (const path of paths) {
    if (path.endsWith("-light")) lightBases.add(path.slice(0, -"-light".length));
    else if (path.endsWith("-dark")) darkBases.add(path.slice(0, -"-dark".length));
  }

  if (lightBases.size === 0 && darkBases.size === 0) return null;
  return { light: lightBases, dark: darkBases };
}

/**
 * Detect light/dark pairs using prefix pattern (`light-<base>` / `dark-<base>`).
 * Returns sets of base names found in each mode.
 */
function detectPrefixPattern(paths: string[]): { light: Set<string>; dark: Set<string> } | null {
  const lightBases = new Set<string>();
  const darkBases = new Set<string>();

  for (const path of paths) {
    // Match at the segment level: "light-<base>" or "dark-<base>"
    // Also handles paths like "theme/light-primary" → base "theme/primary"
    const segments = path.split("/");
    const last = segments[segments.length - 1]!;
    const prefix = segments.slice(0, -1).join("/");
    const sep = prefix ? "/" : "";

    if (last.startsWith("light-")) {
      lightBases.add(prefix + sep + last.slice("light-".length));
    } else if (last.startsWith("dark-")) {
      darkBases.add(prefix + sep + last.slice("dark-".length));
    }
  }

  if (lightBases.size === 0 && darkBases.size === 0) return null;
  return { light: lightBases, dark: darkBases };
}

/**
 * Detect light/dark pairs using path-segment pattern (`/light/` / `/dark/`).
 * E.g. "color/light/primary" and "color/dark/primary" → base "color/primary".
 * Returns sets of base names found in each mode.
 */
function detectPathSegmentPattern(paths: string[]): { light: Set<string>; dark: Set<string> } | null {
  const lightBases = new Set<string>();
  const darkBases = new Set<string>();

  for (const path of paths) {
    const lightIdx = path.indexOf("/light/");
    const darkIdx = path.indexOf("/dark/");
    if (lightIdx !== -1) {
      // Replace "/light/" segment with "/" to get base path
      lightBases.add(path.slice(0, lightIdx) + "/" + path.slice(lightIdx + "/light/".length));
    } else if (darkIdx !== -1) {
      darkBases.add(path.slice(0, darkIdx) + "/" + path.slice(darkIdx + "/dark/".length));
    }
  }

  if (lightBases.size === 0 && darkBases.size === 0) return null;
  return { light: lightBases, dark: darkBases };
}

/**
 * Given light/dark base sets, compute which bases are missing in each mode.
 */
function computeMissing(
  light: Set<string>,
  dark: Set<string>,
): { missingInDark: string[]; missingInLight: string[] } {
  const missingInDark = [...light].filter((b) => !dark.has(b)).sort();
  const missingInLight = [...dark].filter((b) => !light.has(b)).sort();
  return { missingInDark, missingInLight };
}

/**
 * Analyse the TokenMap for light/dark mode parity.
 *
 * The function tries three naming conventions in order (suffix, prefix, path-segment)
 * and uses the FIRST one that detects any dual-mode tokens.
 *
 * If no convention is detected, returns `hasMultipleModes: false` with empty arrays.
 */
export function checkThemeParity(tokenMap: TokenMap): ThemeParityCheck {
  const paths = collectAllTokenPaths(tokenMap);

  // Try detection strategies in order — first match wins
  const detected =
    detectSuffixPattern(paths) ??
    detectPrefixPattern(paths) ??
    detectPathSegmentPattern(paths);

  if (!detected) {
    return { missingInDark: [], missingInLight: [], hasMultipleModes: false };
  }

  const { missingInDark, missingInLight } = computeMissing(detected.light, detected.dark);

  return {
    missingInDark,
    missingInLight,
    hasMultipleModes: true,
  };
}
