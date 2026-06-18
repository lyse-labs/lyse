// <script> extraction for Svelte (.svelte) and Vue (.vue) single-file
// components. The `<script>` / `<script setup>` block is real TS/JS, but the
// audit pipeline only ever parsed the `<style>` block of an SFC — so a
// hardcoded color/spacing constant living in the script (which the .tsx path
// flags) was silently missed on Vue/Svelte design systems (#102).
//
// Extraction is LINE-PRESERVING (output line N == source line N, everything
// else blanked) so the resulting AST + findings carry the correct SFC source
// line. `<template>` and `<style>` are left out — template syntax is not JS,
// and styles go through the dedicated CSS path.
const SCRIPT_BLOCK = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
const HAS_SRC_ATTR = /\bsrc\s*=/i;
const CLOSING_TAG_LEN = "</script>".length;

/**
 * Line-preserving JS/TS-equivalent of all inline `<script>` blocks in an SFC.
 * Blocks with a `src=` attribute (external references, no inline body) are
 * skipped. Returns a string the same line-count as `source`.
 */
export function extractSfcScript(source: string): string {
  const out = new Array<string>(source.split("\n").length).fill("");
  SCRIPT_BLOCK.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SCRIPT_BLOCK.exec(source)) !== null) {
    const attrs = m[1] ?? "";
    const content = m[2] ?? "";
    if (HAS_SRC_ATTR.test(attrs)) continue;
    const contentStartIdx = m.index + (m[0].length - content.length - CLOSING_TAG_LEN);
    const startLine = source.slice(0, contentStartIdx).split("\n").length - 1;
    const blockLines = content.split("\n");
    for (let i = 0; i < blockLines.length; i++) {
      const idx = startLine + i;
      if (idx >= 0 && idx < out.length) out[idx] = blockLines[i] ?? "";
    }
  }
  return out.join("\n");
}
