import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  tokenMapToNodes, detectTokenConflicts, extractTokens,
  cssCustomPropDeclsFromParsed, scssVarDeclsFromContents, dtcgDocumentToNodes, axisFor,
} from "./tokens.js";
import type { TokenMap } from "../../types.js";
import type { ParsedFiles } from "../../types.js";

function emptyMap(source: TokenMap["source"]): TokenMap {
  return {
    colors: new Map(), spacing: new Map(), typography: new Map(), radii: new Map(),
    shadows: new Map(), motion: new Map(), breakpoints: new Map(), zIndex: new Map(),
    opacity: new Map(), borderWidth: new Map(), source,
  };
}
const emptyParsed = (): ParsedFiles => ({ ts: [], css: [], cssInJs: [] });

describe("tokenMapToNodes", () => {
  it("inverts a TokenMap into one node per (value, path)", () => {
    const tm = emptyMap("dtcg");
    tm.colors.set("#3b82f6", ["color/brand/primary"]);
    const nodes = tokenMapToNodes(tm);
    expect(nodes).toEqual([
      { id: "color/brand/primary", axis: "colors", rawValue: "#3b82f6", source: "dtcg" },
    ]);
  });
});

describe("detectTokenConflicts", () => {
  it("flags one (axis,value) claimed by two distinct sources", () => {
    const conflicts = detectTokenConflicts([
      { id: "color/a", axis: "colors", rawValue: "#fff", source: "dtcg" },
      { id: "white", axis: "colors", rawValue: "#fff", source: "tailwind-v3" },
    ]);
    expect(conflicts).toEqual([
      { axis: "colors", value: "#fff", tokenIds: ["color/a", "white"], sources: ["dtcg", "tailwind-v3"] },
    ]);
  });
  it("does not flag a value from a single source", () => {
    expect(detectTokenConflicts([
      { id: "color/a", axis: "colors", rawValue: "#fff", source: "dtcg" },
      { id: "color/b", axis: "colors", rawValue: "#000", source: "dtcg" },
    ])).toEqual([]);
  });
});

describe("extractTokens", () => {
  it("fuses a DTCG source into nodes", async () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-tok-"));
    writeFileSync(join(root, "a.tokens.json"), JSON.stringify({
      color: { primary: { $value: "#3b82f6", $type: "color" } },
    }));
    const out = await extractTokens(root, emptyParsed(), new Map());
    expect(out.sources).toContain("dtcg");
    expect(out.nodes.some((n) => n.rawValue === "#3b82f6" && n.axis === "colors")).toBe(true);
  });
});

describe("cssCustomPropDeclsFromParsed", () => {
  it("mines --x: value from a plain css file but skips @theme files", () => {
    const parsed: ParsedFiles = {
      ts: [],
      css: [
        { path: "a.css", source: ":root { --brand: #3b82f6; --gap: 8px; }" },
        { path: "tw.css", source: "@theme { --color-brand: #fff; }" },
      ],
      cssInJs: [],
    };
    const decls = cssCustomPropDeclsFromParsed(parsed);
    expect(decls).toContainEqual(["--brand", "#3b82f6"]);
    expect(decls).toContainEqual(["--gap", "8px"]);
    expect(decls.some(([p]) => p === "--color-brand")).toBe(false);
  });
});

describe("scssVarDeclsFromContents", () => {
  it("mines $var: value from raw scss and prefixes with --", () => {
    const fc = new Map<string, string>([["src/_vars.scss", "$primary: #3b82f6;\n$gap: 8px;"]]);
    const decls = scssVarDeclsFromContents(fc);
    expect(decls).toContainEqual(["--primary", "#3b82f6"]);
  });
});

describe("dtcgDocumentToNodes", () => {
  it("maps color + dimension leaves to nodes", () => {
    const nodes = dtcgDocumentToNodes(
      { brand: { $value: "#3b82f6", $type: "color" }, gap: { $value: "8px", $type: "dimension" } },
      "css-custom-property",
    );
    expect(nodes).toContainEqual({ id: "brand", axis: "colors", rawValue: "#3b82f6", source: "css-custom-property" });
    expect(nodes).toContainEqual({ id: "gap", axis: "spacing", rawValue: "8", source: "css-custom-property" });
  });

  it("canonicalizes dimension/duration/cubicBezier rawValue to match fromDtcg's loader keying", () => {
    const nodes = dtcgDocumentToNodes(
      {
        gap: { $value: "8px", $type: "dimension" },
        fade: { $value: "200ms", $type: "duration" },
        ease: { $value: [0.4, 0, 0.2, 1], $type: "cubicBezier" },
      },
      "css-custom-property",
    );
    expect(nodes).toContainEqual({ id: "gap", axis: "spacing", rawValue: "8", source: "css-custom-property" });
    expect(nodes).toContainEqual({ id: "fade", axis: "motion", rawValue: "duration/200ms", source: "css-custom-property" });
    expect(nodes).toContainEqual({
      id: "ease", axis: "motion", rawValue: "easing/cubic-bezier(0.4, 0, 0.2, 1)", source: "css-custom-property",
    });
  });
});

describe("dtcgDocumentToNodes / loader rawValue parity (conflict-mask regression)", () => {
  it("does not mask a spacing conflict between a tailwind-v3 TokenMap and a DTCG dimension token", () => {
    const tm = emptyMap("tailwind-v3");
    tm.spacing.set("8", ["scale/sm"]);
    const tailwindNodes = tokenMapToNodes(tm);

    const dtcgNodes = dtcgDocumentToNodes(
      { gap: { $value: "8px", $type: "dimension" } },
      "css-custom-property",
    );

    const conflicts = detectTokenConflicts([...tailwindNodes, ...dtcgNodes]);
    expect(conflicts).toEqual([
      {
        axis: "spacing",
        value: "8",
        tokenIds: ["gap", "scale/sm"],
        sources: ["css-custom-property", "tailwind-v3"],
      },
    ]);
  });

  it("does not mask a motion conflict between a tailwind-v3 TokenMap and a DTCG duration token", () => {
    const tm = emptyMap("tailwind-v3");
    tm.motion.set("duration/200ms", ["motion/dur/fast"]);
    const tailwindNodes = tokenMapToNodes(tm);

    const dtcgNodes = dtcgDocumentToNodes(
      { fade: { $value: "200ms", $type: "duration" } },
      "css-custom-property",
    );

    const conflicts = detectTokenConflicts([...tailwindNodes, ...dtcgNodes]);
    expect(conflicts).toEqual([
      {
        axis: "motion",
        value: "duration/200ms",
        tokenIds: ["fade", "motion/dur/fast"],
        sources: ["css-custom-property", "tailwind-v3"],
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Task 7b — the css-custom-property / scss path must route on the token PATH,
// not on the $type alone. Before the fix every `dimension` collapsed onto
// `spacing` and every `number` was dropped.
// ---------------------------------------------------------------------------
const NUMERIC_AXIS_CSS = `:root {
  --color-brand: #3b82f6;
  --radius-sm: 4px;
  --radius-md: 8px;
  --z-modal: 100;
  --opacity-disabled: 0.5;
  --border-width-thin: 1px;
  --border-width-thick: 2px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 1024px;
  --space-md: 16px;
}`;

const NUMERIC_AXIS_SCSS = `$color-brand: #3b82f6;
$radius-sm: 4px;
$radius-md: 8px;
$z-modal: 100;
$opacity-disabled: 0.5;
$border-width-thin: 1px;
$border-width-thick: 2px;
$breakpoint-md: 768px;
$breakpoint-lg: 1024px;
$space-md: 16px;`;

function byAxis(nodes: Array<{ id: string; axis: string; rawValue: string }>, axis: string): string[] {
  return nodes.filter((n) => n.axis === axis).map((n) => n.id).sort();
}

describe("axisFor (path-aware axis routing)", () => {
  it("routes dimension by path instead of collapsing everything onto spacing", () => {
    expect(axisFor("dimension", "radius/sm")).toBe("radii");
    expect(axisFor("dimension", "border/width/thin")).toBe("borderWidth");
    expect(axisFor("dimension", "breakpoint/md")).toBe("breakpoints");
    expect(axisFor("dimension", "screen/lg")).toBe("breakpoints");
    expect(axisFor("dimension", "space/md")).toBe("spacing");
  });

  it("maps number to zIndex / opacity (previously dropped entirely)", () => {
    expect(axisFor("number", "z/index/modal")).toBe("zIndex");
    expect(axisFor("number", "opacity/disabled")).toBe("opacity");
    expect(axisFor("number", "line/height/tight")).toBeUndefined();
  });

  it("matches the `--z-*` prefix shortening that `z.?index` misses", () => {
    // `--z-modal` normalises to the path `z/modal`; the `/` anchor keeps
    // unrelated z-initial names off the zIndex axis.
    expect(axisFor("number", "z/modal")).toBe("zIndex");
    expect(axisFor("number", "z")).toBe("zIndex");
    expect(axisFor("number", "zoom/level")).toBeUndefined();
  });

  it("leaves color / duration / cubicBezier untouched", () => {
    expect(axisFor("color", "anything")).toBe("colors");
    expect(axisFor("duration", "anything")).toBe("motion");
    expect(axisFor("cubicBezier", "anything")).toBe("motion");
  });
});

describe("extractTokens — plain :root custom properties reach every numeric axis", () => {
  it("does not collapse radii/borderWidth/breakpoints/zIndex/opacity onto spacing", async () => {
    const parsed: ParsedFiles = {
      ts: [], css: [{ path: "src/tokens.css", source: NUMERIC_AXIS_CSS }], cssInJs: [],
    };
    const root = mkdtempSync(join(tmpdir(), "lyse-axes-"));
    const out = await extractTokens(root, parsed, new Map());

    expect(byAxis(out.nodes, "radii")).toEqual(["radius/md", "radius/sm"]);
    expect(byAxis(out.nodes, "borderWidth")).toEqual(["border/width/thick", "border/width/thin"]);
    expect(byAxis(out.nodes, "breakpoints")).toEqual(["breakpoint/lg", "breakpoint/md"]);
    expect(byAxis(out.nodes, "zIndex")).toEqual(["z/modal"]);
    expect(byAxis(out.nodes, "opacity")).toEqual(["opacity/disabled"]);
    expect(byAxis(out.nodes, "spacing")).toEqual(["space/md"]);
    expect(byAxis(out.nodes, "colors")).toEqual(["color/brand"]);
  });

  it("routes the equivalent SCSS $vars the same way", async () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-axes-scss-"));
    const out = await extractTokens(
      root, emptyParsed(), new Map([["src/_tokens.scss", NUMERIC_AXIS_SCSS]]),
    );

    expect(byAxis(out.nodes, "radii")).toEqual(["radius/md", "radius/sm"]);
    expect(byAxis(out.nodes, "borderWidth")).toEqual(["border/width/thick", "border/width/thin"]);
    expect(byAxis(out.nodes, "breakpoints")).toEqual(["breakpoint/lg", "breakpoint/md"]);
    expect(byAxis(out.nodes, "zIndex")).toEqual(["z/modal"]);
    expect(byAxis(out.nodes, "opacity")).toEqual(["opacity/disabled"]);
    expect(byAxis(out.nodes, "spacing")).toEqual(["space/md"]);
  });

  it("lands `--z-modal: 100` on zIndex, not nowhere", async () => {
    const parsed: ParsedFiles = {
      ts: [], css: [{ path: "a.css", source: ":root { --z-modal: 100; }" }], cssInJs: [],
    };
    const out = await extractTokens(mkdtempSync(join(tmpdir(), "lyse-z-")), parsed, new Map());
    expect(out.nodes.filter((n) => n.source === "css-custom-property")).toEqual([
      { id: "z/modal", axis: "zIndex", rawValue: "100", source: "css-custom-property" },
    ]);
  });
});

describe("canonicalRawValue is axis-aware (cross-source conflict parity)", () => {
  it("serialises radii / borderWidth / breakpoints identically to fromDtcg", async () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-parity-"));
    writeFileSync(join(root, "a.tokens.json"), JSON.stringify({
      radius: { sm: { $value: "4px", $type: "dimension" } },
      border: { width: { thin: { $value: "1px", $type: "dimension" } } },
      breakpoint: { md: { $value: "768px", $type: "dimension" } },
      space: { md: { $value: "16px", $type: "dimension" } },
      z: { index: { modal: { $value: "100", $type: "number" } } },
      opacity: { disabled: { $value: "0.5", $type: "number" } },
    }));
    const parsed: ParsedFiles = {
      ts: [],
      css: [{
        path: "a.css",
        source: `:root { --radius-sm: 4px; --border-width-thin: 1px; --breakpoint-md: 768px;
          --space-md: 16px; --z-modal: 100; --opacity-disabled: 0.5; }`,
      }],
      cssInJs: [],
    };
    const out = await extractTokens(root, parsed, new Map());

    const valuesOn = (axis: string, source: string): string[] =>
      out.nodes.filter((n) => n.axis === axis && n.source === source).map((n) => n.rawValue).sort();

    for (const axis of ["radii", "borderWidth", "breakpoints", "spacing", "zIndex", "opacity"]) {
      expect(valuesOn(axis, "css-custom-property")).toEqual(valuesOn(axis, "dtcg"));
    }
    // …and specifically: the px suffix survives on the non-spacing axes.
    expect(valuesOn("radii", "css-custom-property")).toEqual(["4px"]);
    expect(valuesOn("spacing", "css-custom-property")).toEqual(["16"]);

    // Identical rawValues from two sources are exactly what conflict detection
    // is for — this is the invariant that silently broke before the fix.
    expect(out.conflicts.map((c) => c.axis).sort()).toEqual([
      "borderWidth", "breakpoints", "opacity", "radii", "spacing", "zIndex",
    ]);
  });
});

describe("extractTokens (css/scss sources)", () => {
  it("includes css-custom-property nodes from parsed css", async () => {
    const parsed: ParsedFiles = {
      ts: [], css: [{ path: "a.css", source: ":root { --brand: #3b82f6; }" }], cssInJs: [],
    };
    const out = await extractTokens(process.cwd(), parsed, new Map());
    expect(out.sources).toContain("css-custom-property");
    expect(out.nodes.some((n) => n.source === "css-custom-property" && n.rawValue === "#3b82f6")).toBe(true);
  });
});
