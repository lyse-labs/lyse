/**
 * TDD guard: color functions with non-literal arguments must NOT be flagged.
 *
 * Real snippets from the color-harvest labeled dataset (color-harvest-labels.md, archived in lyse-internal):
 *   id 9:   rgba(theme.colors.blue[6], 0.2)   — mantine, fpClass "other"
 *   id 20:  rgba(theme.colors.blue[4], 0.2)   — mantine, fpClass "other"
 *   id 35:  rgba(lightParsed.value, 0.07)      — mantine, fpClass "other"
 *   id 51:  oklch(from var(--color-mktg-btn-bg) l c h)  — primer-css, fpClass "config"
 *   ids 90–103: oklch(from var(--primary) l c h)         — shadcn, fpClass "config"
 *   ids 134–140: color-mix(in oklch, var(--muted), var(--foreground) 5%) — shadcn, fpClass "config"
 *
 * Recall guard: pure-literal calls must still flag.
 */
import { describe, it, expect } from "vitest";
import { detectInText } from "../../src/rules/tokens-no-hardcoded-color.js";

// ---------------------------------------------------------------------------
// FP cases — must NOT be flagged (non-literal first argument)
// ---------------------------------------------------------------------------
describe("color-fn with non-literal args — must NOT flag (FP guard)", () => {
  it("rgba with member-access first arg: rgba(theme.colors.blue[6], 0.2)", () => {
    const src = `const style = { boxShadow: rgba(theme.colors.blue[6], 0.2) };`;
    expect(detectInText(src)).toHaveLength(0);
  });

  it("rgba with member-access first arg: rgba(theme.colors.blue[4], 0.2)", () => {
    const src = `const style = { background: rgba(theme.colors.blue[4], 0.2) };`;
    expect(detectInText(src)).toHaveLength(0);
  });

  it("rgba with identifier.property first arg: rgba(lightParsed.value, 0.07)", () => {
    const src = `const color = rgba(lightParsed.value, 0.07);`;
    expect(detectInText(src)).toHaveLength(0);
  });

  it("oklch relative-color with CSS var: oklch(from var(--primary) l c h)", () => {
    const src = `.btn { background: oklch(from var(--primary) l c h); }`;
    expect(detectInText(src)).toHaveLength(0);
  });

  it("oklch relative-color from named var: oklch(from var(--color-mktg-btn-bg) l c h)", () => {
    const src = `.mktg-btn { color: oklch(from var(--color-mktg-btn-bg) l c h); }`;
    expect(detectInText(src)).toHaveLength(0);
  });

  it("color-mix with var args: color-mix(in oklch, var(--muted), var(--foreground) 5%)", () => {
    // Tailwind arbitrary-value form as seen in shadcn bubble.tsx (ids 134-140)
    const src = `<div className="bg-[color-mix(in_oklch,var(--muted),var(--foreground)_5%)]" />`;
    expect(detectInText(src)).toHaveLength(0);
  });

  it("color-mix all-var: color-mix(in oklch, var(--accent), white)", () => {
    const src = `.chip { background: color-mix(in oklch, var(--accent), white); }`;
    expect(detectInText(src)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Recall guard — pure literal args must STILL flag
// ---------------------------------------------------------------------------
describe("color-fn with pure literal args — must still flag (recall guard)", () => {
  it("rgba with pure numeric literals: rgba(255, 255, 255, 0.5)", () => {
    const hits = detectInText(`box-shadow: rgba(255, 255, 255, 0.5);`);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]?.match).toContain("rgba(255");
  });

  it("rgb with pure numeric literals: rgb(37, 99, 235)", () => {
    const hits = detectInText(`color: rgb(37, 99, 235);`);
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });

  it("hsl with pure numeric literals: hsl(217, 83%, 53%)", () => {
    const hits = detectInText(`color: hsl(217, 83%, 53%);`);
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });

  it("oklch with pure numeric literals: oklch(0.65 0.2 240)", () => {
    const hits = detectInText(`color: oklch(0.65 0.2 240);`);
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });

  it("bare hex still flags: #2563eb", () => {
    const hits = detectInText(`color: #2563eb;`);
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });
});
