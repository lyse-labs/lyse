import type { ParsedCssFile } from "../types.js";
import { transformScssToCss } from "./scss-transform.js";

/**
 * `.scss` files are transformed to CSS-equivalent source via the local
 * `transformScssToCss` pass. Downstream rules (tokens, hardcoded values)
 * then consume the transformed source as if it were plain CSS.
 *
 * `.sass` (indented syntax) is still skipped — postcss-scss does not parse
 * it natively and the marketplace share is small enough that v0.1.0 defers
 * dedicated support. The audit pipeline counts skipped files so users see
 * a clear warning.
 *
 * Plain CSS files are returned as-is. Lightning CSS (used in
 * `loaders/tokens.ts`) parses CSS where it's actually needed; the rules
 * engine only consumes the raw source via `ParsedCssFile.source`.
 */
const SCSS_EXT = /\.scss$/i;
const SASS_EXT = /\.sass$/i;

export async function parseCss(path: string, source: string): Promise<ParsedCssFile> {
  if (SASS_EXT.test(path)) {
    return { path, source, skipped: true };
  }
  if (SCSS_EXT.test(path)) {
    try {
      return { path, source: transformScssToCss(source) };
    } catch {
      return { path, source, skipped: true };
    }
  }
  return { path, source };
}
