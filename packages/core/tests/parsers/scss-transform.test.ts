import { describe, it, expect } from "vitest";
import { transformScssToCss } from "../../src/parsers/scss-transform.js";

describe("transformScssToCss", () => {
  it("resolves $variable interpolation inside :root", () => {
    const out = transformScssToCss(`
      $primary-500: #3b82f6;
      $spacing-md: 16px;

      :root {
        --primary-500: #{$primary-500};
        --spacing-md: #{$spacing-md};
      }
    `);

    expect(out).toContain("--primary-500: #3b82f6");
    expect(out).toContain("--spacing-md: 16px");
    expect(out).not.toContain("$primary-500: #3b82f6");
  });

  it("drops $variable declarations from the output", () => {
    const out = transformScssToCss(`
      $brand: red;
      .a { color: blue; }
    `);

    expect(out).not.toMatch(/\$brand\s*:/);
    expect(out).toContain(".a { color: blue;");
  });

  it("strips SCSS-only at-rules (@mixin / @include / @if / @for / @use / @import)", () => {
    const out = transformScssToCss(`
      @use "sass:math";
      @import "partials/colors";
      @mixin button($bg) { background: $bg; }
      @if $debug { .x { outline: 1px; } }
      @for $i from 1 through 3 { .col-#{$i} { width: 10px; } }
      .keep { color: red; }
    `);

    expect(out).not.toMatch(/@mixin/);
    expect(out).not.toMatch(/@use/);
    expect(out).not.toMatch(/@import/);
    expect(out).not.toMatch(/@if/);
    expect(out).not.toMatch(/@for/);
    expect(out).toContain(".keep { color: red");
  });

  it("preserves plain @-rules (@media, @theme, @supports, @keyframes)", () => {
    const out = transformScssToCss(`
      @media (min-width: 768px) { .x { color: red; } }
      @theme { --token: 1px; }
      @supports (display: grid) { .y { display: grid; } }
      @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
    `);

    expect(out).toContain("@media");
    expect(out).toContain("@theme");
    expect(out).toContain("@supports");
    expect(out).toContain("@keyframes");
  });

  it("leaves unresolved interpolation literal so downstream rules can flag it", () => {
    const out = transformScssToCss(`
      :root { --x: #{$undeclared}; }
    `);

    expect(out).toContain("#{$undeclared}");
  });

  it("handles whitespace inside #{ ... }", () => {
    const out = transformScssToCss(`
      $bg: red;
      .a { background: #{ $bg }; }
    `);

    expect(out).toContain("background: red");
  });

  it("keeps nested rules in source (rules engine scans raw text)", () => {
    const out = transformScssToCss(`
      .card {
        padding: 16px;
        .header { color: #333; }
      }
    `);

    expect(out).toContain("padding: 16px");
    expect(out).toContain("color: #333");
  });

  it("converts SCSS `//` line comments into block comments (valid CSS)", () => {
    const out = transformScssToCss(`
      // a single-line comment
      /* a block comment */
      .a { color: red; }
    `);

    expect(out).toContain("a block comment");
    expect(out).toMatch(/\/\*\s*a single-line comment\s*\*\//);
    expect(out).toContain(".a { color: red");
  });

  it("preserves an empty :root block when SCSS strips all decls", () => {
    const out = transformScssToCss(`
      $only: 1px;
      :root {}
    `);

    expect(out).toContain(":root");
  });

  // --- Line-number fidelity (regression: SCSS findings were off by the number
  //     of stripped $var/@mixin lines above them; see #120 cross-tool finding) ---

  it("preserves the total line count", () => {
    const src = `$brand: blue;
.card {
  padding: 24px;
  color: #ff0000;
}`;
    const out = transformScssToCss(src);
    expect(out.split("\n").length).toBe(src.split("\n").length);
  });

  it("keeps each kept declaration on its ORIGINAL source line after a leading $var", () => {
    const src = `$brand: blue;
.card {
  padding: 24px;
  color: #ff0000;
}`;
    const lines = transformScssToCss(src).split("\n");
    // padding was on source line 3 (1-based) → must stay on line 3
    expect(lines[2]).toContain("padding: 24px");
    // color was on source line 4 → must stay on line 4
    expect(lines[3]).toContain("color: #ff0000");
  });

  it("keeps line numbers stable across multiple stripped @mixin / $var blocks", () => {
    const src = `$prefix: bs;
@mixin rtl {
  margin-left: 60px;
}
.card {
  color: #ff0000;
}`;
    const lines = transformScssToCss(src).split("\n");
    expect(lines.length).toBe(src.split("\n").length);
    // .card color is on source line 6 → must stay on line 6
    expect(lines[5]).toContain("color: #ff0000");
  });

  it("keeps @mixin BODY declarations (recall) while blanking the header + closing brace", () => {
    const src = `@mixin card {
  color: #ff0000;
  padding: 24px;
}
.x { margin: 8px; }`;
    const out = transformScssToCss(src);
    const lines = out.split("\n");
    // header + closing brace blanked → no @mixin token leaks
    expect(out).not.toMatch(/@mixin/);
    expect(lines[3]).not.toContain("}"); // line 4 (closing brace) blanked
    // body declarations preserved on their original lines (drift surface)
    expect(lines[1]).toContain("#ff0000"); // source line 2
    expect(lines[2]).toContain("24px"); // source line 3
    // line count preserved
    expect(lines.length).toBe(src.split("\n").length);
  });

  it("still fully blanks single-line @mixin (header === closing line)", () => {
    const out = transformScssToCss(`@mixin b($bg) { background: $bg; }\n.k { color: red; }`);
    expect(out).not.toMatch(/@mixin/);
    expect(out).not.toContain("background");
    expect(out).toContain(".k { color: red");
  });

  it("still fully blanks @function bodies (SCSS logic, not CSS)", () => {
    const out = transformScssToCss(`@function double($n) {\n  @return $n * 2;\n}\n.k { width: 10px; }`);
    expect(out).not.toMatch(/@function/);
    expect(out).not.toContain("@return");
    expect(out).toContain("width: 10px");
  });

  it("does not mangle // inside url() when converting line comments", () => {
    const out = transformScssToCss(`.a { background: url(http://example.com/x.png); }`);
    expect(out).toContain("url(http://example.com/x.png)");
  });
});
