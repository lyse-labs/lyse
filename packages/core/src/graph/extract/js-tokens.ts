/**
 * Token definitions written as a JavaScript or TypeScript object.
 *
 * `extractTokens` reads Tailwind config, CSS `@theme`, DTCG JSON,
 * style-dictionary JSON, literal CSS custom properties and SCSS `$var`
 * declarations — and nothing else. Carbon's themes are
 * `packages/themes/src/g10.js`, Chakra's are TypeScript, Mantine's likewise, so
 * on those repositories Lyse extracted almost nothing and the tokens axis
 * abstained for want of a denominator. Measured before this existed
 * (`pnpm measure:tokens`): chakra 0 token nodes against 995 token-shaped object
 * entries, carbon-react 4 against 52.
 *
 * A text scan, deliberately, matching `scssVarDeclsFromContents` — the pipeline
 * has no AST for these files and evaluating a theme module would mean running
 * third-party code.
 */

/** `key: value` where the key may be bare, 'quoted' or "quoted". */
const ENTRY_RE =
  /(?:^|[{,]\s*)(?:["']([\w$-]+)["']|([A-Za-z_$][\w$]*))\s*:\s*(["'`])([^"'`\n]+)\3/g;

/**
 * What a design-token value looks like: a colour, a length, or a duration.
 * Everything else in a theme object — labels, URLs, font stacks, booleans — is
 * configuration, not a token, and admitting it would inflate the denominator
 * the tokens axis is scored over.
 */
const TOKEN_VALUE_RE =
  /^(#[0-9a-fA-F]{3,8}|(?:rgba?|hsla?|oklch|oklab|lab|lch|color-mix)\(|-?(?:\d*\.)?\d+(px|rem|em|vh|vw|ms|s|%|ch|ex)$)/;

/**
 * How many token-shaped entries a file needs before it is believed to be a
 * token module.
 *
 * The gate is the whole design. Without it a styled component holding one
 * `color: '#fff'` becomes a token definition, and every component in the
 * repository inflates the denominator the tokens axis divides by — the same
 * failure as `MIN_COMPONENT_FILES = 1`, which made an API client's SQLite
 * wrapper a design system on the strength of one file.
 *
 * Pinned at 8 because that is the smallest real theme module observed in the
 * pinned corpus and comfortably above what a component file reaches. It has NOT
 * been calibrated against the negative corpus; do that (`pnpm measure:tokens`
 * plus `pnpm measure:ds-precision`) before this reader is wired into
 * `extractTokens`, and report both sides together.
 */
export const MIN_TOKEN_ENTRIES_PER_FILE = 8;

const JS_EXT_RE = /\.(?:m|c)?[jt]sx?$/;

function isJsLike(rel: string): boolean {
  if (rel.endsWith(".d.ts")) return false;
  return JS_EXT_RE.test(rel);
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * `[name, value]` pairs, in file then source order. Files below the density gate
 * contribute nothing at all — not their strongest entries, not any of them.
 */
export function jsTokenDeclsFromContents(
  fileContents: ReadonlyMap<string, string>,
): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [rel, src] of fileContents) {
    if (!isJsLike(rel)) continue;
    const cleaned = stripComments(src);
    const perFile: Array<[string, string]> = [];
    ENTRY_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ENTRY_RE.exec(cleaned)) !== null) {
      const name = m[1] ?? m[2];
      const value = m[4]?.trim();
      if (name === undefined || value === undefined) continue;
      if (!TOKEN_VALUE_RE.test(value)) continue;
      perFile.push([name, value]);
    }
    if (perFile.length >= MIN_TOKEN_ENTRIES_PER_FILE) out.push(...perFile);
  }
  return out;
}
