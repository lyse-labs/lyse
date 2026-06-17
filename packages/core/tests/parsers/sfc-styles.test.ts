import { describe, it, expect } from "vitest";
import { extractSfcStyleBlocks } from "../../src/parsers/sfc-styles.js";

describe("extractSfcStyleBlocks", () => {
  it("extracts a Svelte <style> block", () => {
    const src = `<script>export let x;</script>\n<div class="x" />\n<style>.x { color: #ff0000; padding: 13px; }</style>`;
    expect(extractSfcStyleBlocks(src)).toEqual([".x { color: #ff0000; padding: 13px; }"]);
  });

  it("extracts a Vue <style scoped lang=\"scss\"> block (attrs ignored)", () => {
    const src = `<template><div/></template>\n<style scoped lang="scss">.a { color: #00f; }</style>`;
    expect(extractSfcStyleBlocks(src)).toEqual([".a { color: #00f; }"]);
  });

  it("extracts multiple style blocks", () => {
    const src = `<style>.a{color:red}</style>\n<template/>\n<style>.b{color:blue}</style>`;
    expect(extractSfcStyleBlocks(src)).toHaveLength(2);
  });

  it("returns [] when there is no <style> block", () => {
    expect(extractSfcStyleBlocks(`<script>const a=1;</script><div/>`)).toEqual([]);
  });
});
