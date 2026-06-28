/**
 * TDD guard: HTML numeric character entity FP class for tokens/no-hardcoded-color.
 *
 * Real snippets from the color-harvest labeled dataset:
 *   - `&#039;` (apostrophe) — the `#039` portion matches the hex regex as a 3-digit hex color
 *   - `&#8203;` (zero-width space) — the `#8203` portion matches the hex regex as a 4-digit hex color
 *
 * Detection approach (Fix A — general):
 *   A hex-looking match that is immediately preceded by `&` in the source
 *   (forming `&#NNN;` or `&#xNN;`) is an HTML numeric character reference,
 *   not a CSS/JS color value. The guard checks whether `source[index - 1] === '&'`
 *   which is the canonical signal — not path-specific, not content-specific
 *   beyond the immediately adjacent character.
 *
 * Recall constraints:
 *   - `#039` as a real 3-digit hex color (`color: #039;`) MUST still flag.
 *   - `#039000` as a real 6-digit hex color MUST still flag.
 *   - `#8203` as a real hex color MUST still flag.
 *   - Colors in normal .tsx/.css files are NOT affected by this guard.
 */
import { describe, it, expect } from "vitest";
import { detectInText } from "../../src/rules/tokens-no-hardcoded-color.js";

describe("tokens/no-hardcoded-color — Fix A: HTML numeric entities are not colors", () => {
  // ── FALSE POSITIVES that must NOT be flagged ────────────────────────────────

  it("does not flag &#039; (HTML apostrophe entity)", () => {
    const source = `<p>It&#039;s a great day</p>`;
    const hits = detectInText(source);
    expect(hits).toHaveLength(0);
  });

  it("does not flag &#8203; (HTML zero-width space entity)", () => {
    const source = `const zws = '&#8203;';`;
    const hits = detectInText(source);
    expect(hits).toHaveLength(0);
  });

  it("does not flag &#039; embedded in JSX template literal", () => {
    const source = `export const msg = \`Don&#039;t forget\`;`;
    const hits = detectInText(source);
    expect(hits).toHaveLength(0);
  });

  it("does not flag multiple HTML entities on the same line", () => {
    // &#039; (apostrophe) and &#8203; (zero-width space) — both are entities
    const source = `<span>It&#039;s fine&#8203;</span>`;
    const hits = detectInText(source);
    expect(hits).toHaveLength(0);
  });

  it("does not flag &#xAB; (hex HTML entity with x-prefix) — variant form", () => {
    // &#xAB; = «  — the #xAB should not be flagged as a color
    const source = `<p>&#xAB;quoted&#xBB;</p>`;
    const hits = detectInText(source);
    expect(hits).toHaveLength(0);
  });

  // ── RECALL: real colors that MUST still flag ─────────────────────────────────

  it("still flags #039 as a real 3-digit hex color in CSS", () => {
    const source = `.button { color: #039; }`;
    const hits = detectInText(source, undefined, true);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.match).toBe("#039");
  });

  it("still flags #039000 as a real 6-digit hex color in CSS", () => {
    const source = `.button { background: #039000; }`;
    const hits = detectInText(source, undefined, true);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.match).toBe("#039000");
  });

  it("still flags #8203AB as a real 6-digit hex color in a style prop", () => {
    const source = `const style = { color: '#8203AB' };`;
    const hits = detectInText(source);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.match).toBe("#8203AB");
  });

  it("still flags a normal #hex color in a component", () => {
    const source = `export function Button() { return <div style={{ background: '#2563eb' }} />; }`;
    const hits = detectInText(source);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.match).toBe("#2563eb");
  });

  it("still flags #039 color adjacent to (but not preceded by) an ampersand on the same line", () => {
    // & appears but it's NOT immediately preceding the #039 match
    const source = `const x = 'foo & bar'; const color = '#039';`;
    const hits = detectInText(source);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.match).toBe("#039");
  });
});
