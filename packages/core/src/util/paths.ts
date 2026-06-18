/**
 * Cross-platform path helpers (#104).
 *
 * Lyse's file walker (fast-glob) returns forward-slash paths even on Windows,
 * while `path.resolve` / repo roots use the OS separator (`\` on Windows). A
 * naive `abs.startsWith(root + "/")` therefore fails on Windows, leaving
 * finding `location.file` paths absolute (or backslash-separated). Finding
 * paths are user-facing and cross-repo-compared, so they must be relative and
 * forward-slash on every platform.
 */

/** Normalize a path to forward slashes. */
export function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * Path of `abs` relative to `root`, forward-slash normalized, separator-agnostic.
 * Returns the posix-normalized `abs` unchanged if it is not under `root`.
 */
export function posixRelative(root: string, abs: string): string {
  const r = toPosix(root);
  const a = toPosix(abs);
  const prefix = r.endsWith("/") ? r : `${r}/`;
  return a.startsWith(prefix) ? a.slice(prefix.length) : a;
}
