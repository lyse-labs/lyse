// Single-File-Component <style> extraction for Svelte (.svelte) and Vue (.vue).
// These frameworks embed component CSS in a `<style>` block rather than a
// separate .css file, so the token-drift detectors (which scan CSS sources)
// would otherwise have a systematic blind spot on Svelte/Vue design systems
// (#102). `lang="scss"` and `scoped` attributes are ignored — the downstream
// detectors scan the raw declaration text and don't require valid CSS.
const STYLE_BLOCK = /<style[^>]*>([\s\S]*?)<\/style>/gi;

export function extractSfcStyleBlocks(source: string): string[] {
  STYLE_BLOCK.lastIndex = 0;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = STYLE_BLOCK.exec(source)) !== null) {
    const content = m[1]?.trim();
    if (content) out.push(content);
  }
  return out;
}
