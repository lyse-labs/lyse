import { parseColor } from "../../a11y/contrast.js";

/**
 * A colour value carries no design-drift signal when it is design-universal:
 * fully transparent, pure white, or pure black. Such values byte-coincide with a
 * token by ubiquity, not by an intent to reuse the design system — so the colour
 * rule does not flag them and the exact-bucket measurement excludes them.
 *
 * Parse-based (reuses the resolver's own `parseColor`), so every representation
 * — #fff, #ffffff, rgb(255,255,255), rgba(255,255,255,1), hsl(0,0%,100%), named
 * `white` — is recognised. EXACT equality only: `#fffffe` and every real colour
 * are NOT trivial. Fail-open: an unparseable value returns false (never suppress
 * a finding we do not understand).
 */
export function isTrivialColor(value: string): boolean {
  const parsed = parseColor(value);
  if (parsed === null) return false;
  if (parsed.a === 0) return true; // fully transparent — no visible colour
  if (parsed.a !== 1) return false; // translucent — strict: not trivial
  const { r, g, b } = parsed;
  return (r === 255 && g === 255 && b === 255) || (r === 0 && g === 0 && b === 0);
}
