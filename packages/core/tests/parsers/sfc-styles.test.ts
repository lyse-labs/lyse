import { describe, it, expect } from "vitest";
import { extractSfcStyleBlocks, extractSfcStyleCss } from "../../src/parsers/sfc-styles.js";

describe("extractSfcStyleBlocks", () => {
  it("extracts a Svelte <style> block with its lang + start line", () => {
    const src = `<script>export let x;</script>\n<div class="x" />\n<style>.x { color: #ff0000; }</style>`;
    const blocks = extractSfcStyleBlocks(src);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.content).toBe(".x { color: #ff0000; }");
    expect(blocks[0]!.lang).toBeNull();
    expect(blocks[0]!.startLine).toBe(2); // 0-based: the third line
  });

  it("captures lang=\"scss\" (and is case/quote tolerant)", () => {
    const src = `<template><div/></template>\n<style scoped lang='scss'>.a { color: #00f; }</style>`;
    const blocks = extractSfcStyleBlocks(src);
    expect(blocks[0]!.lang).toBe("scss");
  });

  it("extracts multiple style blocks", () => {
    const src = `<style>.a{color:red}</style>\n<template/>\n<style>.b{color:blue}</style>`;
    expect(extractSfcStyleBlocks(src)).toHaveLength(2);
  });

  it("returns [] when there is no <style> block", () => {
    expect(extractSfcStyleBlocks(`<script>const a=1;</script><div/>`)).toEqual([]);
  });
});

describe("extractSfcStyleCss", () => {
  it("passes plain CSS <style> content through, line-preserved", () => {
    const src = `<template><div/></template>\n<style>\n.x { color: #ff0000; }\n</style>`;
    const css = extractSfcStyleCss(src).split("\n");
    // The declaration sits on source line 3 (0-based index 2).
    expect(css[2]).toContain("color: #ff0000;");
    expect(css[0]).toBe(""); // template line blanked
  });

  it("transforms a lang=\"scss\" block so $-var definitions do NOT leak as values", () => {
    const src = [
      `<template><button/></template>`,
      `<style lang="scss" scoped>`,
      `$brand: #3B82F6;`,
      `.btn {`,
      `  color: #FF0000;`,
      `  &:hover { color: $brand; }`,
      `}`,
      `</style>`,
    ].join("\n");
    const css = extractSfcStyleCss(src);
    // The SCSS variable DEFINITION value must be gone (transform blanks $-decls).
    expect(css).not.toContain("#3B82F6");
    // The genuine hardcoded color in a real declaration survives.
    expect(css).toContain("#FF0000");
  });

  it("preserves line numbers: a hardcoded value reports on its source line", () => {
    const src = [
      `<template><button/></template>`, // line 1
      `<script setup>const x = 1;</script>`, // line 2
      `<style lang="scss">`, // line 3
      `.btn { color: #FF0000; }`, // line 4 — the drift
      `</style>`, // line 5
    ].join("\n");
    const lines = extractSfcStyleCss(src).split("\n");
    expect(lines[3]).toContain("#FF0000"); // 0-based index 3 == source line 4
  });

  it("neutralizes // line comments in scss blocks (no value FP from comments)", () => {
    const src = [
      `<style lang="scss">`,
      `.a { margin: 0; // bump to 16px later`,
      `}`,
      `</style>`,
    ].join("\n");
    const css = extractSfcStyleCss(src);
    // 16px lived only inside a // comment → must end up inside a /* */ block.
    expect(css).toContain("/*");
    expect(css).not.toMatch(/16px[^*]*$/m);
  });

  it("drops lang=\"sass\" (indented syntax we cannot safely parse)", () => {
    const src = `<style lang="sass">\n.a\n  color: #FF0000\n</style>`;
    expect(extractSfcStyleCss(src).trim()).toBe("");
  });

  it("returns an empty (blank) string when there is no <style> block", () => {
    expect(extractSfcStyleCss(`<template><div/></template>`).trim()).toBe("");
  });
});
