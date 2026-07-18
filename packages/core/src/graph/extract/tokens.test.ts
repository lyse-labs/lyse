import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  tokenMapToNodes, detectTokenConflicts, extractTokens,
  cssCustomPropDeclsFromParsed, scssVarDeclsFromContents, dtcgDocumentToNodes,
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
