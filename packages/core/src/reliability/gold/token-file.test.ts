import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseTokenFile, tokenRefKey } from "./token-file.js";
import { isColorLiteral } from "./color-eq.js";

describe("isColorLiteral", () => {
  it("accepts colour literals and rejects non-colours", () => {
    expect(isColorLiteral("#3b82f6")).toBe(true);
    expect(isColorLiteral("rgb(59,130,246)")).toBe(true);
    expect(isColorLiteral("16px")).toBe(false);
    expect(isColorLiteral("$other")).toBe(false);
  });
});

describe("parseTokenFile", () => {
  it("extracts SCSS $variables that hold a colour", () => {
    const m = parseTokenFile("$brand: #3b82f6;\n$space: 16px;\n$alias: $brand;", "scss");
    expect(m.get("$brand")).toEqual(["#3b82f6"]);
    expect(m.has("$space")).toBe(false); // non-colour dropped
    expect(m.has("$alias")).toBe(false); // alias dropped (not a literal colour)
  });

  it("extracts CSS custom properties that hold a colour, comment-safe", () => {
    const m = parseTokenFile(":root{--brand:#3b82f6;/* --x:#000 */--z:1400}", "css");
    expect(m.get("--brand")).toEqual(["#3b82f6"]);
    expect(m.has("--z")).toBe(false);
    expect(m.has("--x")).toBe(false); // commented out
  });

  it("keeps multiple values when a token is redefined across themes", () => {
    const m = parseTokenFile(".light{--brand:#111111}.dark{--brand:#222222}", "css");
    expect(m.get("--brand")).toEqual(["#111111", "#222222"]);
  });

  it("treats // as a comment in SCSS but NOT in CSS", () => {
    // SCSS: `//` is a real line comment → the trailing declaration is stripped.
    const scss = parseTokenFile("$a: #111111; // $b: #222222;", "scss");
    expect(scss.get("$a")).toEqual(["#111111"]);
    expect(scss.has("$b")).toBe(false);
    // CSS: `//` is not a comment → a declaration after it on the same line survives.
    const css = parseTokenFile("--a: #111111; // --b: #222222;", "css");
    expect(css.get("--a")).toEqual(["#111111"]);
    expect(css.get("--b")).toEqual(["#222222"]);
  });
});

describe("tokenRefKey", () => {
  it("normalizes CSS and SCSS references, rejects JS member access", () => {
    expect(tokenRefKey("var(--blue-9)")).toBe("--blue-9");
    expect(tokenRefKey("$blue-500")).toBe("$blue-500");
    expect(tokenRefKey("theme.colors.brand")).toBeNull();
    expect(tokenRefKey("base.orange400")).toBeNull();
  });
});

describe("independence (ADR 0022 §3b)", () => {
  it("token-file.ts imports nothing from graph/resolve or a11y/contrast", () => {
    const src = readFileSync(new URL("./token-file.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/graph\/resolve/);
    expect(src).not.toMatch(/a11y\/contrast/);
  });
});
