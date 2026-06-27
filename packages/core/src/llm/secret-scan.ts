/**
 * High-confidence secret-content scan. Applied to each source window/file
 * BEFORE it is sent to the LLM precision filter — a matching file is dropped
 * from the payload entirely (never sent). The PRIVACY notice promises this.
 *
 * Patterns are deliberately narrow (provider-specific key shapes, PEM headers,
 * and quoted long-value `key: "..."` assignments) to avoid false positives on
 * ordinary design-system source.
 */
const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bsk-[A-Za-z0-9]{20,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /(api[_-]?key|secret|token|password)\s*[:=]\s*["'][^"']{16,}["']/i,
];

export function containsLikelySecret(text: string): boolean {
  return SECRET_PATTERNS.some((re) => re.test(text));
}
