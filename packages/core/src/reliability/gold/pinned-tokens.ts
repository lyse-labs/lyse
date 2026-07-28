import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveCssVarInRepo, type ResolveTokenValue } from "./confirm.js";
import { parseTokenFile, parseTokenJson, tokenRefKey, type TokenFileKind } from "./token-file.js";

function kindFor(path: string): TokenFileKind | null {
  if (path.endsWith(".scss")) return "scss";
  if (path.endsWith(".css")) return "css";
  return null;
}

/** Load + parse the committed snapshot file(s) for one corpus repo into a single
 *  ref→values map. Missing files / non-CSS-SCSS files are skipped (never throw). */
export function loadPinnedTokens(pinsRepoDir: string, files: string[]): Map<string, string[]> {
  const merged = new Map<string, string[]>();
  for (const rel of files) {
    const abs = join(pinsRepoDir, rel);
    if (!existsSync(abs)) continue;
    let content: string;
    try {
      content = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    let parsed: Map<string, string[]>;
    if (rel.endsWith(".json")) {
      parsed = parseTokenJson(content);
    } else {
      const kind = kindFor(rel);
      if (kind === null) continue;
      parsed = parseTokenFile(content, kind);
    }
    for (const [k, vals] of parsed) {
      const list = merged.get(k) ?? [];
      list.push(...vals);
      merged.set(k, list);
    }
  }
  return merged;
}

/** Injected Gate-B resolver: the pinned snapshot value (by normalized ref key)
 *  first, else the built-in in-repo CSS var resolver. Empty array → Gate B fails
 *  closed. Un-fabricable: the pinned value comes from the committed real artifact. */
export function makePinnedResolveTokenValue(
  repoDir: string,
  pinned: Map<string, string[]>,
): ResolveTokenValue {
  return async (ref, commit) => {
    const key = tokenRefKey(ref);
    if (key !== null) {
      const vals = pinned.get(key);
      if (vals !== undefined && vals.length > 0) return vals;
    }
    return resolveCssVarInRepo(repoDir, ref, commit);
  };
}
