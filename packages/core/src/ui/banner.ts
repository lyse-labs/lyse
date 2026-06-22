import { color, type UiOpts } from "./tokens.js";

const BRAND_MARK = "◈";

export function brandHeader(version: string, subtitle: string, opts: UiOpts): string {
  const mark = opts.unicode ? `${color.brand(BRAND_MARK, opts)} ` : "";
  const word = color.brand("lyse", opts);
  const sub = color.muted(subtitle, opts);
  const ver = color.muted(version, opts);
  return `  ${mark}${word}  ${sub}   ${ver}`;
}
