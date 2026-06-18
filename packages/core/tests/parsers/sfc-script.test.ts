import { describe, it, expect } from "vitest";
import { extractSfcScript } from "../../src/parsers/sfc-script.js";

describe("extractSfcScript", () => {
  it("extracts a <script setup> block, line-preserving", () => {
    const src = [
      `<template><button/></template>`, // 1
      `<script setup lang="ts">`, // 2
      `const accent = "#3B82F6";`, // 3
      `</script>`, // 4
      `<style>.a{color:red}</style>`, // 5
    ].join("\n");
    const lines = extractSfcScript(src).split("\n");
    expect(lines[2]).toContain(`const accent = "#3B82F6";`); // 0-based 2 == source line 3
    expect(lines[0]).toBe(""); // template line blanked
    expect(lines[4]).toBe(""); // style line blanked
  });

  it("concatenates two script blocks (plain + setup), each line-preserved", () => {
    const src = [
      `<script>export default { name: "X" }</script>`, // 1
      `<template><div/></template>`, // 2
      `<script setup>const z = 1;</script>`, // 3
    ].join("\n");
    const lines = extractSfcScript(src).split("\n");
    expect(lines[0]).toContain(`name: "X"`);
    expect(lines[1]).toBe("");
    expect(lines[2]).toContain("const z = 1;");
  });

  it("ignores a <script src=…> external reference (no inline body to scan)", () => {
    const src = `<script src="./external.ts"></script>\n<template><div/></template>`;
    expect(extractSfcScript(src).trim()).toBe("");
  });

  it("returns a blank string when there is no <script> block", () => {
    expect(extractSfcScript(`<template><div/></template>\n<style>.a{}</style>`).trim()).toBe("");
  });

  it("does not capture <style> or <template> content", () => {
    const src = `<style>.a{color:#FF0000}</style>\n<script>const a=1;</script>`;
    const out = extractSfcScript(src);
    expect(out).not.toContain("#FF0000");
    expect(out).toContain("const a=1;");
  });
});
