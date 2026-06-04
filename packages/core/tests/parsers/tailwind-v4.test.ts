import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseTailwindV4Theme } from "../../src/parsers/tailwind-v4.js";
import { isDtcgGroup, isDtcgToken } from "../../src/tokens/dtcg-model.js";

describe("parseTailwindV4Theme", () => {
  it("returns an empty document when no @theme block is present", () => {
    const result = parseTailwindV4Theme(`@import "tailwindcss";\n`);
    expect(result.document).toEqual({});
    expect(result.utilityGenerating).toEqual([]);
    expect(result.private).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("returns an empty document when @theme is empty", () => {
    const result = parseTailwindV4Theme(`@theme {}`);
    expect(result.document).toEqual({});
    expect(result.utilityGenerating).toEqual([]);
    expect(result.private).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("classifies utility-generating vs private @theme vars", () => {
    const css = `
      @theme {
        --color-brand: oklch(0.5 0.2 240);
        --spacing-md: 1rem;
        --my-private-thing: 1px;
      }
    `;
    const result = parseTailwindV4Theme(css);
    expect(result.utilityGenerating).toEqual(["--color-brand", "--spacing-md"]);
    expect(result.private).toEqual(["--my-private-thing"]);
    expect(result.warnings.some((w) => w.includes("--my-private-thing"))).toBe(true);
    const color = result.document.color;
    if (!isDtcgGroup(color)) throw new Error("expected color group");
    const brand = color.brand;
    if (!isDtcgToken(brand)) throw new Error("expected brand token");
    expect(brand.$value).toBe("oklch(0.5 0.2 240)");
  });

  it("merges multiple @theme blocks", () => {
    const css = `
      @theme { --color-a: #aaa; }
      @theme { --color-b: #bbb; }
    `;
    const result = parseTailwindV4Theme(css);
    expect(result.utilityGenerating).toEqual(["--color-a", "--color-b"]);
    const color = result.document.color;
    if (!isDtcgGroup(color)) throw new Error("expected color group");
    expect(isDtcgToken(color.a)).toBe(true);
    expect(isDtcgToken(color.b)).toBe(true);
  });

  it("preserves composite shadow value byte-for-byte", () => {
    const expected =
      "0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)";
    const css = `@theme { --shadow-card: ${expected}; }`;
    const result = parseTailwindV4Theme(css);
    const shadow = result.document.shadow;
    if (!isDtcgGroup(shadow)) throw new Error("expected shadow group");
    const card = shadow.card;
    if (!isDtcgToken(card)) throw new Error("expected shadow.card token");
    expect(card.$value).toBe(expected);
  });

  it("preserves cubic-bezier argument spacing", () => {
    const css = `@theme { --ease-snappy: cubic-bezier(0.4, 0, 0.2, 1); }`;
    const result = parseTailwindV4Theme(css);
    const easing = result.document.easing;
    if (!isDtcgGroup(easing)) throw new Error("expected easing group");
    const snappy = easing.snappy;
    if (!isDtcgToken(snappy)) throw new Error("expected easing.snappy token");
    expect(snappy.$value).toBe("cubic-bezier(0.4, 0, 0.2, 1)");
  });

  it("does not crash on invalid CSS (errorRecovery)", () => {
    const css = `
      @theme {
        --color-brand: #abc;
        this is not valid css syntax
      }
    `;
    const result = parseTailwindV4Theme(css);
    const color = result.document.color;
    if (!isDtcgGroup(color)) throw new Error("expected color group");
    expect(isDtcgToken(color.brand)).toBe(true);
  });

  it("parses the realistic tailwind-v4-theme.css fixture", () => {
    const css = readFileSync(
      join(import.meta.dirname, "../fixtures/tailwind-v4-theme.css"),
      "utf8",
    );
    const result = parseTailwindV4Theme(css);
    expect(result.utilityGenerating).toContain("--color-brand-500");
    expect(result.utilityGenerating).toContain("--color-accent");
    expect(result.private).toEqual(["--internal-do-not-use"]);

    const color = result.document.color;
    if (!isDtcgGroup(color)) throw new Error("expected color group");
    const brand500 = color["brand-500"];
    if (!isDtcgToken(brand500)) throw new Error("expected color.brand-500 token");
    expect(brand500.$type).toBe("color");

    const shadow = result.document.shadow;
    if (!isDtcgGroup(shadow)) throw new Error("expected shadow group");
    const card = shadow.card;
    if (!isDtcgToken(card)) throw new Error("expected shadow.card token");
    expect(card.$value).toContain("rgba(0, 0, 0, 0.1)");
    expect(card.$type).toBe("shadow");

    const duration = result.document.duration;
    if (!isDtcgGroup(duration)) throw new Error("expected duration group");
    const fast = duration.fast;
    if (!isDtcgToken(fast)) throw new Error("expected duration.fast token");
    expect(fast.$type).toBe("duration");
    expect(fast.$value).toBe("150ms");
  });

  it("deduplicates utility-generating and private prop lists across blocks", () => {
    const css = `
      @theme { --color-x: #aaa; --priv: 1px; }
      @theme { --color-x: #bbb; --priv: 2px; }
    `;
    const result = parseTailwindV4Theme(css);
    expect(result.utilityGenerating.filter((p) => p === "--color-x").length).toBe(1);
    expect(result.private.filter((p) => p === "--priv").length).toBe(1);
  });
});
