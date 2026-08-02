import { describe, it, expect } from "vitest";
import { jsTokenDeclsFromContents, MIN_TOKEN_ENTRIES_PER_FILE } from "./js-tokens.js";

const file = (rel: string, src: string) => new Map([[rel, src]]);

/** A theme module in the shape carbon, chakra and mantine all ship. */
const THEME = `
export const g10 = {
  background: '#ffffff',
  backgroundInverse: '#393939',
  interactive: '#0f62fe',
  borderSubtle: '#e0e0e0',
  textPrimary: '#161616',
  spacing01: '0.125rem',
  spacing02: '0.25rem',
  durationFast: '110ms',
};
`;

describe("jsTokenDeclsFromContents", () => {
  it("reads a theme module's entries", () => {
    const decls = jsTokenDeclsFromContents(file("src/themes/g10.js", THEME));
    const names = decls.map(([n]) => n);
    expect(names).toContain("background");
    expect(names).toContain("interactive");
    expect(decls.find(([n]) => n === "interactive")?.[1]).toBe("#0f62fe");
    expect(decls.find(([n]) => n === "durationFast")?.[1]).toBe("110ms");
  });

  it("ignores a file that merely mentions a colour", () => {
    // A component with one inline hex is not a token module. Without a density
    // gate this reader would turn every styled component in the repository into
    // token definitions, which is how a denominator becomes fiction.
    const decls = jsTokenDeclsFromContents(
      file("src/Button.tsx", `export const Button = () => <div style={{ color: '#fff' }} />;`),
    );
    expect(decls).toEqual([]);
  });

  it("needs at least MIN_TOKEN_ENTRIES_PER_FILE entries before it trusts a file", () => {
    const entries = (n: number) =>
      `export const t = {\n${Array.from({ length: n }, (_, i) => `  c${i}: '#00000${i % 10}',`).join("\n")}\n};`;
    expect(jsTokenDeclsFromContents(file("t.ts", entries(MIN_TOKEN_ENTRIES_PER_FILE - 1)))).toEqual([]);
    expect(jsTokenDeclsFromContents(file("t.ts", entries(MIN_TOKEN_ENTRIES_PER_FILE)))).toHaveLength(
      MIN_TOKEN_ENTRIES_PER_FILE,
    );
  });

  it("skips declaration files — a .d.ts declares types, never values", () => {
    expect(jsTokenDeclsFromContents(file("src/themes/g10.d.ts", THEME))).toEqual([]);
  });

  it("skips files that are not JavaScript or TypeScript", () => {
    expect(jsTokenDeclsFromContents(file("src/themes/g10.json", THEME))).toEqual([]);
    expect(jsTokenDeclsFromContents(file("src/themes/g10.scss", THEME))).toEqual([]);
  });

  it("ignores commented-out entries", () => {
    const src = THEME.replace("interactive: '#0f62fe',", "// interactive: '#0f62fe',");
    expect(jsTokenDeclsFromContents(file("t.ts", src)).map(([n]) => n)).not.toContain("interactive");
  });

  it("accepts quoted and unquoted keys, single and double quotes", () => {
    const src = `export const t = {
      "a": "#111111", 'b': '#222222', c: \`#333333\`,
      d: '#444444', e: '#555555', f: '#666666',
      g: '#777777', h: '#888888',
    };`;
    const names = jsTokenDeclsFromContents(file("t.ts", src)).map(([n]) => n);
    expect(names).toEqual(expect.arrayContaining(["a", "b", "c", "d"]));
  });

  it("keeps only values that look like design-token values", () => {
    const src = `export const t = {
      good1: '#111111', good2: 'rgb(1,2,3)', good3: '2rem', good4: '150ms',
      good5: 'hsl(1 2% 3%)', good6: 'oklch(0.7 0.1 200)', good7: '4px', good8: '1.5em',
      label: 'Primary button', url: 'https://example.com', flag: 'true',
    };`;
    const names = jsTokenDeclsFromContents(file("t.ts", src)).map(([n]) => n);
    expect(names).not.toContain("label");
    expect(names).not.toContain("url");
    expect(names).not.toContain("flag");
    expect(names).toContain("good6");
  });

  it("is deterministic — same input, same order", () => {
    const a = jsTokenDeclsFromContents(file("t.ts", THEME));
    const b = jsTokenDeclsFromContents(file("t.ts", THEME));
    expect(a).toEqual(b);
  });
});
