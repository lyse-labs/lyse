const ROOT_SELECTORS = new Set([":root", "html", ":where(:root)"]);
const RULE = /([^{}]+)\{([^}]*)\}/g;
const DECL = /(--[\w-]+)\s*:\s*([^;]+)\s*;?/g;

function normalizeMode(selector: string): string {
  const s = selector.trim();
  return ROOT_SELECTORS.has(s) ? "root" : s;
}

export function buildTokenSourceMap(css: string): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  let rule: RegExpExecArray | null;
  RULE.lastIndex = 0;
  while ((rule = RULE.exec(css)) !== null) {
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
