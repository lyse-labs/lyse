import {
  fromTailwindV3, fromTailwindV4, fromDtcg, fromValueTypeTokens,
} from "../../loaders/tokens.js";
import { normalizeToDtcg } from "../../tokens/normalizer.js";
import { isDtcgToken } from "../../tokens/dtcg-model.js";
import type { DtcgDocument, DtcgToken, DtcgType } from "../../tokens/dtcg-model.js";
import type { TokenMap, ParsedFiles } from "../../types.js";
import type { TokenNode, TokenConflict, TokenSource, TokenAxis } from "../types.js";

const AXES: TokenAxis[] = [
  "colors", "spacing", "typography", "radii", "shadows",
  "motion", "breakpoints", "zIndex", "opacity", "borderWidth",
];

export interface TokenExtraction {
  nodes: TokenNode[];
  conflicts: TokenConflict[];
  sources: TokenSource[];
}

function narrowSource(source: TokenMap["source"]): TokenSource {
  switch (source) {
    case "tailwind-v3":
    case "tailwind-v4":
    case "dtcg":
    case "style-dictionary":
    case "tokens-studio":
    case "figma-variables":
      return source;
    case "css-vars":
      return "css-custom-property";
    case "mixed":
      return "dtcg";
  }
}

export function tokenMapToNodes(tm: TokenMap): TokenNode[] {
  const nodes: TokenNode[] = [];
  const source = narrowSource(tm.source);
  for (const axis of AXES) {
    for (const [rawValue, ids] of tm[axis]) {
      for (const id of ids) nodes.push({ id, axis, rawValue, source });
    }
  }
  return nodes;
}

// A NUL character can't appear in an axis name or a raw token value, so it's a
// collision-proof join delimiter. Built via fromCharCode to avoid a raw control
// byte in this source file.
const CONFLICT_KEY_DELIMITER = String.fromCharCode(0);

export function detectTokenConflicts(nodes: TokenNode[]): TokenConflict[] {
  const groups = new Map<string, TokenNode[]>();
  for (const n of nodes) {
    const key = `${n.axis}${CONFLICT_KEY_DELIMITER}${n.rawValue}`;
    const list = groups.get(key) ?? [];
    list.push(n);
    groups.set(key, list);
  }
  const conflicts: TokenConflict[] = [];
  for (const list of groups.values()) {
    const sources = [...new Set(list.map((n) => n.source))].sort();
    if (sources.length < 2) continue;
    const first = list[0];
    if (!first) continue;
    conflicts.push({
      axis: first.axis,
      value: first.rawValue,
      tokenIds: [...new Set(list.map((n) => n.id))].sort(),
      sources,
    });
  }
  conflicts.sort((a, b) =>
    a.axis === b.axis ? (a.value < b.value ? -1 : a.value > b.value ? 1 : 0) : a.axis < b.axis ? -1 : 1,
  );
  return conflicts;
}

// WHY: `dimension` and `number` are each shared by several axes, so the $type
// alone cannot name one — the token's own PATH has to break the tie. These are
// the same heuristics loaders/tokens.ts#fromDtcg applies to the identical job,
// kept deliberately in lockstep with it: the two must agree or a token means a
// different axis depending on which file format declared it.
//
// The one deliberate addition is `^z/`. A css custom property is split on `-`
// into path segments (tokens/normalizer.ts#normalizeCssVars), so the idiomatic
// `--z-modal` — the same prefix Tailwind v4 uses for z-index — becomes the path
// `z/modal`, which `z.?index` does not match. The trailing `/` anchor keeps it
// from swallowing unrelated `z`-initial names like `zoom/level`.
const RADIUS_PATH = /radius/i;
const BORDER_WIDTH_PATH = /border.?width/i;
const BREAKPOINT_PATH = /breakpoint|screen/i;
const Z_INDEX_PATH = /z.?index/i;
const Z_PREFIX_PATH = /^z(\/|$)/i;
const OPACITY_PATH = /opacity/i;

export function axisFor(type: DtcgType, tokenPath: string): TokenAxis | undefined {
  switch (type) {
    case "color":
      return "colors";
    case "duration":
    case "cubicBezier":
      return "motion";
    case "dimension":
      if (RADIUS_PATH.test(tokenPath)) return "radii";
      if (BORDER_WIDTH_PATH.test(tokenPath)) return "borderWidth";
      if (BREAKPOINT_PATH.test(tokenPath)) return "breakpoints";
      return "spacing";
    case "number":
      if (Z_INDEX_PATH.test(tokenPath) || Z_PREFIX_PATH.test(tokenPath)) return "zIndex";
      if (OPACITY_PATH.test(tokenPath)) return "opacity";
      return undefined;
    default:
      return undefined;
  }
}

const CSS_DECL_RE = /(--[^\s:{}]+)\s*:\s*([^;]+?)\s*;/g;
const SCSS_VAR_RE = /\$([A-Za-z0-9_-]+)\s*:\s*([^;!]+?)\s*(?:!default)?\s*;/g;

export function cssCustomPropDeclsFromParsed(parsed: ParsedFiles): Array<[string, string]> {
  const decls: Array<[string, string]> = [];
  for (const f of parsed.css) {
    if (f.skipped) continue;
    if (f.source.includes("@theme")) continue;
    const cleaned = f.source.replace(/\/\*[\s\S]*?\*\//g, "");
    let m: RegExpExecArray | null;
    CSS_DECL_RE.lastIndex = 0;
    while ((m = CSS_DECL_RE.exec(cleaned)) !== null) {
      const prop = m[1];
      const value = m[2];
      if (prop && value !== undefined) decls.push([prop, value.trim()]);
    }
  }
  return decls;
}

export function scssVarDeclsFromContents(fileContents: Map<string, string>): Array<[string, string]> {
  const decls: Array<[string, string]> = [];
  for (const [rel, src] of fileContents) {
    if (!rel.endsWith(".scss")) continue;
    const cleaned = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    let m: RegExpExecArray | null;
    SCSS_VAR_RE.lastIndex = 0;
    while ((m = SCSS_VAR_RE.exec(cleaned)) !== null) {
      const name = m[1];
      const value = m[2];
      if (name && value !== undefined) decls.push([`--${name}`, value.trim()]);
    }
  }
  return decls;
}

// WHY: detectTokenConflicts groups nodes by raw string equality (and
// graph/query.ts#onScale / #reverseLookup match on it exactly), so a DTCG-doc
// node must serialize its rawValue identically to what fromDtcg (loaders/tokens.ts)
// produces for the same token, or a real cross-source conflict goes undetected.
// That is an AXIS-level contract, not a $type-level one: the loaders px-strip
// `dimension` only on `spacing`, and keep the suffix on radii / borderWidth /
// breakpoints (fromTailwindV4 does the same).
function canonicalRawValue(axis: TokenAxis, $type: DtcgType, $value: unknown): string {
  const value = String($value).toLowerCase().trim();
  switch ($type) {
    case "dimension":
      return axis === "spacing" ? value.replace(/px$/, "") : value;
    case "duration":
      return `duration/${value}`;
    case "cubicBezier": {
      const bezier = Array.isArray($value)
        ? `cubic-bezier(${($value as unknown[]).join(", ")})`
        : String($value);
      return `easing/${bezier.toLowerCase()}`;
    }
    default:
      return value;
  }
}

export function dtcgDocumentToNodes(doc: DtcgDocument, source: TokenSource): TokenNode[] {
  const nodes: TokenNode[] = [];
  const visit = (node: unknown, path: string[]): void => {
    if (!node || typeof node !== "object") return;
    if (isDtcgToken(node)) {
      const tok = node as DtcgToken<unknown>;
      const type = tok.$type;
      const id = path.join("/");
      const axis = type ? axisFor(type, id) : undefined;
      if (axis && type && tok.$value !== undefined) {
        nodes.push({ id, axis, rawValue: canonicalRawValue(axis, type, tok.$value), source });
      }
      return;
    }
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k.startsWith("$")) continue;
      visit(v, [...path, k]);
    }
  };
  visit(doc, []);
  return nodes;
}

function declsToNodes(decls: Array<[string, string]>, source: TokenSource): TokenNode[] {
  if (decls.length === 0) return [];
  const { document } = normalizeToDtcg({ source: "css-vars", data: new Map(decls) });
  return dtcgDocumentToNodes(document, source);
}

export async function extractTokens(
  root: string,
  parsed: ParsedFiles,
  fileContents: Map<string, string>,
): Promise<TokenExtraction> {
  const maps = (await Promise.all([
    fromTailwindV3(root), fromTailwindV4(root), fromDtcg(root), fromValueTypeTokens(root),
  ])).filter((m): m is TokenMap => m !== null);

  const nodes: TokenNode[] = [];
  const sources = new Set<TokenSource>();
  for (const m of maps) {
    const ns = tokenMapToNodes(m);
    for (const n of ns) { nodes.push(n); sources.add(n.source); }
  }
  for (const n of declsToNodes(cssCustomPropDeclsFromParsed(parsed), "css-custom-property")) {
    nodes.push(n); sources.add(n.source);
  }
  for (const n of declsToNodes(scssVarDeclsFromContents(fileContents), "scss-variable")) {
    nodes.push(n); sources.add(n.source);
  }
  return { nodes, conflicts: detectTokenConflicts(nodes), sources: [...sources].sort() };
}
