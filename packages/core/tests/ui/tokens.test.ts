import { describe, it, expect } from "vitest";
import { color, glyph, statusOf, statusGlyph, bar, type UiOpts } from "../../src/ui/tokens.js";

const plain: UiOpts = { color: false, unicode: false };
const rich: UiOpts = { color: true, unicode: true };

describe("ui/tokens", () => {
  it("statusOf maps score bands", () => {
    expect(statusOf(85)).toBe("pass");
    expect(statusOf(70)).toBe("pass");
    expect(statusOf(64)).toBe("warn");
    expect(statusOf(40)).toBe("warn");
    expect(statusOf(12)).toBe("fail");
    expect(statusOf("N/A")).toBe("muted");
  });

  it("color painters are identity when color is off", () => {
    expect(color.brand("lyse", plain)).toBe("lyse");
    expect(color.pass("ok", plain)).toBe("ok");
  });

  it("color painters wrap in ANSI when color is on", () => {
    const out = color.brand("lyse", rich);
    expect(out).not.toBe("lyse");
    expect(out).toContain("lyse");
  });

  it("glyph falls back to ASCII when unicode is off", () => {
    expect(glyph("pass", plain)).toBe("v");
    expect(glyph("fail", plain)).toBe("x");
    expect(glyph("barFull", plain)).toBe("#");
    expect(glyph("pass", rich)).toBe("✔");
  });

  it("statusGlyph picks glyph + color by score band (plain)", () => {
    expect(statusGlyph(85, plain)).toBe("v");
    expect(statusGlyph(64, plain)).toBe("!");
    expect(statusGlyph(10, plain)).toBe("x");
    expect(statusGlyph("N/A", plain)).toBe("o");
  });

  it("bar fills proportionally and pads to cells (plain)", () => {
    expect(bar(50, plain, 10)).toBe("#####-----");
    expect(bar("N/A", plain, 4)).toBe("----");
    expect(bar(100, plain, 4)).toBe("####");
  });
});
