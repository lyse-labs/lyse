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

  it("extracts @emotion/styled styled.div`...` (API-identical to styled-components)", () => {
    const source = `
import styled from "@emotion/styled";
export const Box = styled.div\`
  background: #2563eb;
  padding: 16px;
\`;
`.trim();
    const blocks = extractCssInJs("Box.tsx", source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toContain("#2563eb");
    expect(blocks[0].content).toContain("16px");
  });

  it("extracts css`...` from @emotion/react", () => {
    const source = `
import { css } from "@emotion/react";
export const box = css\`color: #ff0000; margin: 8px;\`;
`.trim();
    const blocks = extractCssInJs("box.tsx", source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toContain("#ff0000");
    expect(blocks[0].content).toContain("8px");
  });

  it("extracts css`...` from styled-components named import", () => {
    const source = `
import { css } from "styled-components";
export const mixin = css\`padding: 12px;\`;
`.trim();
    const blocks = extractCssInJs("mixin.ts", source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toContain("12px");
  });

  it("honors `css as` aliasing", () => {
    const source = `
import { css as xcss } from "@emotion/react";
export const box = xcss\`color: #00ff00;\`;
`.trim();
    const blocks = extractCssInJs("box.tsx", source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toContain("#00ff00");
  });

  it("extracts default css from @emotion/css", () => {
    const source = `
import css from "@emotion/css";
export const cls = css\`background: #123456;\`;
`.trim();
    const blocks = extractCssInJs("cls.ts", source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toContain("#123456");
  });

  it("does not extract a `css` tagged template that was never imported", () => {
    // A local `css` not bound to a known package must not be picked up.
    const source = `
const css = (s) => s;
export const x = css\`color: #fff;\`;
`.trim();
    expect(extractCssInJs("x.ts", source)).toEqual([]);
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
