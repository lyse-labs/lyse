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
