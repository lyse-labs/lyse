import { describe, it, expect } from "vitest";
import { extractCssInJs } from "../../src/parsers/css-in-js.js";

describe("extractCssInJs", () => {
  it("extracts styled.div`...` template content", () => {
    const source = `
import styled from "styled-components";
export const Box = styled.div\`
  background: #2563eb;
  padding: 16px;
\`;
`.trim();
    const blocks = extractCssInJs("Box.tsx", source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toContain("#2563eb");
    expect(blocks[0].content).toContain("16px");
    expect(blocks[0].path).toBe("Box.tsx");
    expect(blocks[0].line).toBeGreaterThan(0);
  });

  it("returns [] when styled-components is not imported", () => {
    const source = `export const x = 1;`;
    expect(extractCssInJs("x.ts", source)).toEqual([]);
  });

  it("handles interpolations by replacing them with __EXPR__ placeholders", () => {
    const source = `
import styled from "styled-components";
export const Box = styled.div\`color: \${(p) => p.color};\`;
`.trim();
    const blocks = extractCssInJs("Box.tsx", source);
    expect(blocks[0].content).toContain("__EXPR__");
  });

  describe("extractCssInJs defensive guard", () => {
    it("does NOT throw on babel traverse errors (duplicate decl, etc.)", () => {
      // Intentional duplicate declaration — causes @babel/traverse to throw
      // "Duplicate declaration" on pathological ASTs (reproduces the Carbon bug).
      const source = `const x = 1; const x = 2;`;
      const result = extractCssInJs("test.ts", source);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it("does NOT throw on completely unparseable source", () => {
      const source = `{{{{{ totally broken `;
      const result = extractCssInJs("broken.ts", source);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
