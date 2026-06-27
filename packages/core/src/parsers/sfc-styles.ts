// Single-File-Component <style> extraction for Svelte (.svelte) and Vue (.vue).
// These frameworks embed component CSS in a `<style>` block rather than a
// separate .css file, so the token-drift detectors (which scan CSS sources)
// would otherwise have a systematic blind spot on Svelte/Vue design systems
// (#102).
//
// `<style lang="scss">` is extremely common in Vue/Nuxt. Scanning that block
// as if it were plain CSS produces FALSE POSITIVES — a SCSS `$var: #hex;`
// definition or a value inside a `//` line comment looks like hardcoded drift.
// We therefore run scss blocks through the same `transformScssToCss` pass used
// for `.scss` files (which neutralizes `$`-declarations and `//` comments),
// and we keep the output LINE-PRESERVING so findings report the correct
// `.vue`/`.svelte` source line (matters for codemod edits + SARIF locations).
import { transformScssToCss } from "./scss-transform.js";

const STYLE_BLOCK = /<style([^>]*)>([\s\S]*?)<\/style>/gi;
const LANG_ATTR = /\blang\s*=\s*["']?([a-z]+)/i;
const CLOSING_TAG_LEN = "</style>".length;

export interface SfcStyleBlock {
  /** Raw text between the `<style …>` and `</style>` tags. */
  content: string;
  /** Lowercased `lang` attribute (`scss`, `sass`, `css`, …) or null if absent. */
  lang: string | null;
  /** 0-based source line index where the block's content begins. */
  startLine: number;
}

export function extractSfcStyleBlocks(source: string): SfcStyleBlock[] {
  STYLE_BLOCK.lastIndex = 0;
  const out: SfcStyleBlock[] = [];
  let m: RegExpExecArray | null;
  while ((m = STYLE_BLOCK.exec(source)) !== null) {
    const attrs = m[1] ?? "";
    const content = m[2] ?? "";
    const lang = LANG_ATTR.exec(attrs)?.[1]?.toLowerCase() ?? null;
    const contentStartIdx = m.index + (m[0].length - content.length - CLOSING_TAG_LEN);
    const startLine = source.slice(0, contentStartIdx).split("\n").length - 1;
    out.push({ content, lang, startLine });
  }
  return out;
}

/**
 * Line-preserving CSS-equivalent of all `<style>` blocks in an SFC. Output line
 * N corresponds to source line N (every non-style line is blank), so downstream
 * findings carry the correct source line.
 *
 * - `lang="scss"` → transformed via `transformScssToCss` (blanks `$`-decls,
 *   neutralizes `//` comments). On a parse failure the block is dropped (no raw
 *   fallback — a raw scss scan is exactly the false-positive source we avoid).
 * - no `lang` / `css` / `postcss` → passed through verbatim.
 * - anything else we can't safely treat as CSS (`sass` indented syntax, `less`,
 *   `stylus`) → dropped, mirroring how `.sass` files are skipped.
 */
export function extractSfcStyleCss(source: string): string {
  const out = new Array<string>(source.split("\n").length).fill("");
  for (const block of extractSfcStyleBlocks(source)) {
    const css = blockToCss(block);
    if (css === null) continue;
    const blockLines = css.split("\n");
    for (let i = 0; i < blockLines.length; i++) {
      const idx = block.startLine + i;
      if (idx >= 0 && idx < out.length) out[idx] = blockLines[i] ?? "";
    }
  }
  return out.join("\n");
}

function blockToCss(block: SfcStyleBlock): string | null {
  if (block.lang === "scss") {
    try {
      return transformScssToCss(block.content);
    } catch {
      return null;
    }
  }
  if (block.lang === null || block.lang === "css" || block.lang === "postcss") {
    return block.content;
  }
  return null;
}
