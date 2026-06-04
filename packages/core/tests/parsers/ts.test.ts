import { describe, it, expect } from "vitest";
import { parseTs } from "../../src/parsers/ts.js";

describe("parseTs", () => {
  it("returns an AST and extracts imports", async () => {
    const source = `
import { Button } from "@acme/ui";
import React from "react";
export const X = () => <Button />;
`.trim();
    const out = await parseTs("test.tsx", source);
    expect(out.path).toBe("test.tsx");
    expect(out.source).toBe(source);
    expect(out.imports).toHaveLength(2);
    expect(out.imports[0]).toMatchObject({
      module: "@acme/ui",
      named: ["Button"],
      default: null,
    });
    expect(out.imports[1]).toMatchObject({
      module: "react",
      named: [],
      default: "React",
    });
  });

  it("handles invalid TS gracefully (no throw)", async () => {
    const out = await parseTs("broken.tsx", "const x = ");
    expect(out.imports).toEqual([]);
  });

  describe("parseTs defensive guard", () => {
    it("does NOT throw on malformed source", async () => {
      const result = await parseTs("test.ts", "function {;; broken syntax");
      expect(result).toBeDefined();
      expect(result.imports).toEqual([]);
      expect(result.ast).toBeNull();
    });
  });
});
