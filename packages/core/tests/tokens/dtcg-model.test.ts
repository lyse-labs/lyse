import { describe, it, expect } from "vitest";
import {
  isDtcgAlias,
  isDtcgGroup,
  isDtcgToken,
  parseAliasPath,
} from "../../src/tokens/dtcg-model.js";

describe("dtcg-model type guards", () => {
  it("isDtcgToken returns true when entry has $value", () => {
    expect(isDtcgToken({ $value: "#fff", $type: "color" })).toBe(true);
  });

  it("isDtcgToken returns false for groups and primitives", () => {
    expect(isDtcgToken({ brand: { $value: "#fff" } })).toBe(false);
    expect(isDtcgToken("string")).toBe(false);
    expect(isDtcgToken(null)).toBe(false);
    expect(isDtcgToken(42)).toBe(false);
  });

  it("isDtcgGroup returns true for non-token objects", () => {
    expect(isDtcgGroup({ brand: { $value: "#fff" } })).toBe(true);
    expect(isDtcgGroup({})).toBe(true);
  });

  it("isDtcgGroup returns false for tokens, arrays, null", () => {
    expect(isDtcgGroup({ $value: "x" })).toBe(false);
    expect(isDtcgGroup([])).toBe(false);
    expect(isDtcgGroup(null)).toBe(false);
  });

  it("isDtcgAlias matches `{...}` strings", () => {
    expect(isDtcgAlias("{color.brand.primary}")).toBe(true);
    expect(isDtcgAlias("  {a.b}  ")).toBe(true);
  });

  it("isDtcgAlias rejects non-alias strings", () => {
    expect(isDtcgAlias("#fff")).toBe(false);
    expect(isDtcgAlias("{}")).toBe(false);
    expect(isDtcgAlias("{a}{b}")).toBe(false);
    expect(isDtcgAlias(123)).toBe(false);
  });

  it("parseAliasPath splits the dotted reference", () => {
    expect(parseAliasPath("{color.brand.primary}")).toEqual([
      "color",
      "brand",
      "primary",
    ]);
  });

  it("parseAliasPath handles whitespace around segments", () => {
    expect(parseAliasPath("{ color . brand }")).toEqual(["color", "brand"]);
  });

  describe("$ref JSON-Pointer aliases", () => {
    it("isDtcgAlias matches a { $ref } JSON-Pointer object", () => {
      expect(isDtcgAlias({ $ref: "#/color/brand/primary" })).toBe(true);
    });

    it("isDtcgAlias rejects objects without a string $ref", () => {
      expect(isDtcgAlias({ $ref: 123 })).toBe(false);
      expect(isDtcgAlias({ ref: "#/a/b" })).toBe(false);
      expect(isDtcgAlias({})).toBe(false);
      expect(isDtcgAlias([])).toBe(false);
    });

    it("parseAliasPath parses a JSON-Pointer $ref into segments", () => {
      expect(parseAliasPath({ $ref: "#/color/brand/primary" })).toEqual([
        "color",
        "brand",
        "primary",
      ]);
    });

    it("parseAliasPath tolerates a $ref without the leading '#'", () => {
      expect(parseAliasPath({ $ref: "/color/brand" })).toEqual(["color", "brand"]);
    });

    it("parseAliasPath unescapes RFC 6901 tokens (~1 → /, ~0 → ~)", () => {
      expect(parseAliasPath({ $ref: "#/spacing/~1weird~0name" })).toEqual([
        "spacing",
        "/weird~name",
      ]);
    });
  });
});
