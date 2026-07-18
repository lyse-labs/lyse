import {
  fromTailwindV3, fromTailwindV4, fromDtcg, fromValueTypeTokens, loadTokens,
} from "../../loaders/tokens.js";
import type { TokenMap, ParsedFiles } from "../../types.js";
import type { TokenNode, TokenConflict, TokenSource, TokenAxis } from "../types.js";

const AXES: TokenAxis[] = [
  "colors", "spacing", "typography", "radii", "shadows",
  "motion", "breakpoints", "zIndex", "opacity", "borderWidth",
];

export interface TokenExtraction {
  nodes: TokenNode[];
  conflicts: TokenConflict[];
  primary: TokenMap | null;
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

export async function extractTokens(
  root: string,
  _parsed: ParsedFiles,
  _fileContents: Map<string, string>,
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
  const primary = await loadTokens(root);
  return { nodes, conflicts: detectTokenConflicts(nodes), primary, sources: [...sources].sort() };
}
