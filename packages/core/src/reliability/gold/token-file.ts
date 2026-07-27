import { isColorLiteral } from "./color-eq.js";

export type TokenFileKind = "scss" | "css";

// SCSS `$name: value;` (drops `!default`). CSS `--name: value` terminated by `;`
// or `}` (minified-safe — same grammar shape as loaders/external-tokens.ts, COPIED
// not imported to keep this module resolver-independent).
const SCSS_DECL_RE = /\$([A-Za-z0-9_-]+)\s*:\s*([^;!}]+?)\s*(?:!default)?\s*[;}]/g;
const CSS_DECL_RE = /(--[A-Za-z0-9_-]+)\s*:\s*([^;}]+?)\s*[;}]/g;
const VAR_REF_RE = /^var\(\s*(--[A-Za-z0-9_-]+)\s*\)?/;

function stripComments(source: string, kind: TokenFileKind): string {
  const noBlock = source.replace(/\/\*[\s\S]*?\*\//g, "");
  // `//` line comments exist in SCSS, NOT in CSS — do not strip them for CSS
  // (a CSS value like url(https://…) or a `--token` after `//` must survive).
  return kind === "scss" ? noBlock.replace(/\/\/[^\n]*/g, "") : noBlock;
}

function pushValue(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key) ?? [];
  list.push(value);
  map.set(key, list);
}

/** Extract token-name → colour value(s) from a CSS/SCSS token file. Keys are the
 *  reference form (`$name` / `--name`). Only entries whose value is a literal
 *  colour are kept — aliases (`$x: $y`) and non-colours are dropped (fail-closed
 *  at Gate B). A token redefined across themes yields multiple values. */
export function parseTokenFile(content: string, kind: TokenFileKind): Map<string, string[]> {
  const cleaned = stripComments(content, kind);
  const map = new Map<string, string[]>();
  const re = kind === "scss" ? SCSS_DECL_RE : CSS_DECL_RE;
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    const rawName = m[1];
    const rawValue = m[2];
    if (rawName === undefined || rawValue === undefined) continue;
    const value = rawValue.trim();
    if (!isColorLiteral(value)) continue;
    const key = kind === "scss" ? `$${rawName}` : rawName;
    pushValue(map, key, value.toLowerCase());
  }
  return map;
}

/** Normalize a token reference from a diff into a parser key: `var(--blue-9)` →
 *  `--blue-9`, `$blue-500` → `$blue-500`. Returns null for anything else (JS
 *  member access `theme.colors.x` / `base.orange400`) — out of v1 scope. */
export function tokenRefKey(addedRef: string): string | null {
  const ref = addedRef.trim();
  if (ref.startsWith("$")) return /^\$[A-Za-z0-9_-]+$/.test(ref) ? ref : null;
  const varMatch = VAR_REF_RE.exec(ref);
  return varMatch?.[1] ?? null;
}
