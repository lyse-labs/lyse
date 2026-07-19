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

  describe("parseTs syntax selection across file kinds", () => {
    it("parses a typed Vue SFC <script> block (passed with the .vue path)", async () => {
      const script = [
        `import { Button } from "@acme/ui";`,
        `interface Props { label: string }`,
        `const props = defineProps<Props>();`,
      ].join("\n");
      const out = await parseTs("components/Comp.vue", script);
      expect(out.ast).not.toBeNull();
      expect(out.imports).toHaveLength(1);
      expect(out.imports[0]).toMatchObject({ module: "@acme/ui", named: ["Button"] });
    });

    it("parses a typed Svelte SFC <script> block (passed with the .svelte path)", async () => {
      const script = [
        `import { Icon } from "@acme/ui";`,
        `export let size: number = 16;`,
      ].join("\n");
      const out = await parseTs("components/Comp.svelte", script);
      expect(out.ast).not.toBeNull();
      expect(out.imports).toHaveLength(1);
      expect(out.imports[0]).toMatchObject({ module: "@acme/ui", named: ["Icon"] });
    });

    it("parses a .jsx file containing real JSX", async () => {
      const source = [
        `import { Card } from "@acme/ui";`,
        `export function X() { return <div className="a"><Card /></div>; }`,
      ].join("\n");
      const out = await parseTs("Card.jsx", source);
      expect(out.ast).not.toBeNull();
      expect(out.imports).toHaveLength(1);
      expect(out.imports[0]).toMatchObject({ module: "@acme/ui", named: ["Card"] });
    });

    it("still parses a .ts angle-bracket type assertion (no TSX regression)", async () => {
      const out = await parseTs("cast.ts", `const y = 1; const x = <number>y;`);
      expect(out.ast).not.toBeNull();
    });
  });
});
