/**
 * Escape regex special characters in a string so it can be embedded
 * safely in a `new RegExp(...)` pattern. Used by 3 token templates.
 */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
