// Preprocessing before regex: strip comments (may contain { } or --) then unwrap
// at-rule blocks so inner selectors (:root, .dark) are parsed at top level.
const ROOT_SELECTORS = new Set([":root", "html", ":where(:root)"]);
const RULE = /([^{}]+)\{([^}]*)\}/g;
const DECL = /(--[\w-]+)\s*:\s*([^;]+)\s*;?/g;

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function unwrapAtRules(css: string): string {
  // Replace @media/@supports/@layer/etc. wrappers with their inner content so
  // nested :root/.dark selectors are parsed directly by the flat RULE regex.
  // The at-rule body ends at the LAST } in the block; we walk chars to match
  // outer braces correctly instead of relying on non-greedy regex.
  let result = "";
  let i = 0;
  while (i < css.length) {
    const atIdx = css.indexOf("@", i);
    if (atIdx === -1) {
      result += css.slice(i);
      break;
    }
    result += css.slice(i, atIdx);
    const openBrace = css.indexOf("{", atIdx);
    if (openBrace === -1) {
      result += css.slice(atIdx);
      break;
    }
    let depth = 1;
    let j = openBrace + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
      j++;
    }
    // Extract inner content (between outer braces) and recurse for nested at-rules
    const inner = css.slice(openBrace + 1, j - 1);
    result += unwrapAtRules(inner);
    i = j;
  }
  return result;
}

function normalizeMode(selector: string): string {
  const s = selector.trim();
  return ROOT_SELECTORS.has(s) ? "root" : s;
}

export function buildTokenSourceMap(css: string): Map<string, Map<string, string>> {
  const preprocessed = unwrapAtRules(stripComments(css));
  const out = new Map<string, Map<string, string>>();
  let rule: RegExpExecArray | null;
  RULE.lastIndex = 0;
  while ((rule = RULE.exec(preprocessed)) !== null) {
    const mode = normalizeMode(rule[1]!);
    const body = rule[2]!;
    let d: RegExpExecArray | null;
    DECL.lastIndex = 0;
    while ((d = DECL.exec(body)) !== null) {
      const token = d[1]!;
      const value = d[2]!.trim();
      if (!out.has(token)) out.set(token, new Map());
      out.get(token)!.set(mode, value);
    }
  }
  return out;
}

export function detectModeSelectors(css: string): string[] {
  const modes = new Set<string>();
  for (const [, byMode] of buildTokenSourceMap(css)) {
    for (const mode of byMode.keys()) if (mode !== "root") modes.add(mode);
  }
  return [...modes].sort();
}
