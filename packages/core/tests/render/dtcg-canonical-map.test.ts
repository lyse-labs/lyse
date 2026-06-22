import { describe, it, expect } from "vitest";
import { buildDtcgCanonicalMap, cssVarToTokenPath } from "../../src/render/dtcg-canonical-map.js";

describe("buildDtcgCanonicalMap", () => {
  it("flattens a simple token to path/value", () => {
    const input = { color: { bg: { $value: "#ffffff", $type: "color" } } };
    const map = buildDtcgCanonicalMap(input);
    expect(map.get("color/bg")).toBe("#ffffff");
    expect(map.size).toBe(1);
  });

  it("resolves a direct alias", () => {
    const input = {
      color: {
        bg: { $value: "#fff", $type: "color" },
        fg: { $value: "{color.bg}", $type: "color" },
      },
    };
    const map = buildDtcgCanonicalMap(input);
    expect(map.get("color/fg")).toBe("#fff");
    expect(map.get("color/bg")).toBe("#fff");
  });

  it("resolves alias chains (alias of alias)", () => {
    const input = {
      base: { white: { $value: "#ffffff", $type: "color" } },
      color: {
        bg: { $value: "{base.white}", $type: "color" },
        surface: { $value: "{color.bg}", $type: "color" },
      },
    };
    const map = buildDtcgCanonicalMap(input);
    expect(map.get("base/white")).toBe("#ffffff");
    expect(map.get("color/bg")).toBe("#ffffff");
    expect(map.get("color/surface")).toBe("#ffffff");
  });

  it("leaves unresolvable references as-is", () => {
    const input = {
      color: { orphan: { $value: "{missing.token}", $type: "color" } },
    };
    const map = buildDtcgCanonicalMap(input);
    expect(map.get("color/orphan")).toBe("{missing.token}");
  });

  it("skips group nodes (no $value)", () => {
    const input = {
      color: { $description: "group", bg: { $value: "#000", $type: "color" } },
    };
    const map = buildDtcgCanonicalMap(input);
    expect(map.size).toBe(1);
    expect(map.get("color/bg")).toBe("#000");
  });

  it("skips tokens whose $value is not a string", () => {
    const input = {
      shadow: {
        md: {
          $value: { offsetX: "0px", offsetY: "2px", blur: "4px", color: "#000" },
          $type: "shadow",
        },
      },
    };
    const map = buildDtcgCanonicalMap(input);
    expect(map.size).toBe(0);
  });

  it("returns empty map for non-object input", () => {
    expect(buildDtcgCanonicalMap(null).size).toBe(0);
    expect(buildDtcgCanonicalMap(42).size).toBe(0);
    expect(buildDtcgCanonicalMap("string").size).toBe(0);
  });
});

describe("cssVarToTokenPath", () => {
  it("maps --color-X to color/X", () => {
    expect(cssVarToTokenPath("--color-bg")).toBe("color/bg");
    expect(cssVarToTokenPath("--color-brand-primary")).toBe("color/brand-primary");
  });

  it("maps --spacing-X to spacing/X", () => {
    expect(cssVarToTokenPath("--spacing-4")).toBe("spacing/4");
  });

  it("maps --radius-X to radii/X", () => {
    expect(cssVarToTokenPath("--radius-md")).toBe("radii/md");
  });

  it("maps --shadow-X to shadows/X", () => {
    expect(cssVarToTokenPath("--shadow-lg")).toBe("shadows/lg");
  });

  it("maps --z-X to zIndex/X", () => {
    expect(cssVarToTokenPath("--z-50")).toBe("zIndex/50");
  });

  it("maps --opacity-X to opacity/X", () => {
    expect(cssVarToTokenPath("--opacity-50")).toBe("opacity/50");
  });

  it("maps --border-width-X to borderWidth/X", () => {
    expect(cssVarToTokenPath("--border-width-2")).toBe("borderWidth/2");
  });

  it("maps --breakpoint-X to breakpoints/X", () => {
    expect(cssVarToTokenPath("--breakpoint-md")).toBe("breakpoints/md");
  });

  it("maps --transition-duration-X to motion/duration/X", () => {
    expect(cssVarToTokenPath("--transition-duration-150")).toBe("motion/duration/150");
  });

  it("maps --ease-X to motion/easing/X", () => {
    expect(cssVarToTokenPath("--ease-in")).toBe("motion/easing/in");
  });

  it("maps --font-size-X to typography/X", () => {
    expect(cssVarToTokenPath("--font-size-lg")).toBe("typography/lg");
  });

  it("maps --font-weight-X to typography/weight/X", () => {
    expect(cssVarToTokenPath("--font-weight-bold")).toBe("typography/weight/bold");
  });

  it("maps --leading-X to typography/line-height/X", () => {
    expect(cssVarToTokenPath("--leading-tight")).toBe("typography/line-height/tight");
  });

  it("maps --tracking-X to typography/letter-spacing/X", () => {
    expect(cssVarToTokenPath("--tracking-wide")).toBe("typography/letter-spacing/wide");
  });

  it("returns null for unrecognized prefixes", () => {
    expect(cssVarToTokenPath("--unknown-x")).toBeNull();
    expect(cssVarToTokenPath("--foo")).toBeNull();
    expect(cssVarToTokenPath("color-bg")).toBeNull();
  });
});
