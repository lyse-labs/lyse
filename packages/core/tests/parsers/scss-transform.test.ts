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
});
