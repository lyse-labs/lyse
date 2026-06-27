import { minimatch } from "minimatch";

/**
 * Returns true if the given file path matches any of the provided glob patterns.
 * Used by rules to skip files that are in excluded directories.
 *
 * Patterns use minimatch glob syntax (same as components/no-native-shadows).
 * Examples:
 *   isPathExcluded("examples/foo/bar.tsx", ["examples/**"]) → true
 *   isPathExcluded("apps/docs/pages/index.tsx", ["apps/docs/**"]) → true
 *   isPathExcluded("src/Button.tsx", ["examples/**"]) → false
 */
export function isPathExcluded(filePath: string, excludePaths: string[]): boolean {
  if (excludePaths.length === 0) return false;
  return excludePaths.some((pattern) => minimatch(filePath, pattern, { matchBase: false }));
}

/**
 * Built-in exclusions for paths that are structurally never design-system source:
 * package-manager caches, vendored third-party bundles, and legacy dependency dirs.
 *
 * These are general signals — not repo-specific — and apply to all rules:
 *   - .yarn/  — Yarn PnP release binaries and cache archives (never authored code)
 *   - bower_components/ — Bower dependency directory (deprecated but still present in some repos)
 *   - vendor/ / vendored/ — hand-copied or in-tree third-party code
 *   - third_party/ — explicit vendoring convention used in monorepos
 *
 * node_modules/ is already excluded at the file-collection layer (audit pipeline)
 * and therefore does not need to be listed here.
 */
const BUILTIN_EXCLUDED_SEGMENTS = [".yarn/", "bower_components/", "/vendor/", "/vendored/", "third_party/"];

export function isBuiltinExcludedPath(filePath: string): boolean {
  const normalised = filePath.replace(/\\/g, "/");
  return BUILTIN_EXCLUDED_SEGMENTS.some((seg) => normalised.startsWith(seg) || normalised.includes(seg));
}
