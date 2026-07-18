import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tokenMapToNodes, detectTokenConflicts, extractTokens } from "./tokens.js";
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
  it("fuses a DTCG source into nodes with primary set", async () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-tok-"));
    writeFileSync(join(root, "a.tokens.json"), JSON.stringify({
      color: { primary: { $value: "#3b82f6", $type: "color" } },
    }));
    const out = await extractTokens(root, emptyParsed(), new Map());
    expect(out.sources).toContain("dtcg");
    expect(out.nodes.some((n) => n.rawValue === "#3b82f6" && n.axis === "colors")).toBe(true);
    expect(out.primary).not.toBeNull();
  });
});
