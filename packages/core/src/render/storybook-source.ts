import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

export interface StorybookSource {
  kind: "static" | "url";
  base: string;
  index: unknown;
}

export interface StoryRef {
  id: string;
  title: string;
  url: string;
}

interface StoryEntry {
  id?: string;
  title?: string;
  type?: string;
}

/**
 * Locates a pre-built Storybook. URL wins if given. Otherwise checks the
 * explicit `dir` (relative to repoRoot or absolute) then the conventional
 * `storybook-static/`, looking for `index.json` (v7+) or `stories.json`
 * (legacy). Returns null when none is found — the caller treats this as N/A.
 */
export function resolveStorybook(
  repoRoot: string,
  opts: { dir?: string; url?: string },
): StorybookSource | null {
  if (opts.url) {
    return { kind: "url", base: opts.url.replace(/\/+$/, ""), index: null };
  }
  const dirs = [opts.dir, "storybook-static"].filter((d): d is string => Boolean(d));
  for (const d of dirs) {
    const base = resolve(repoRoot, d);
    for (const name of ["index.json", "stories.json"]) {
      const file = join(base, name);
      if (!existsSync(file)) continue;
      try {
        const index = JSON.parse(readFileSync(file, "utf8"));
        return { kind: "static", base, index };
      } catch {
        // malformed index — keep looking
      }
    }
  }
  return null;
}

function storyUrl(source: StorybookSource, id: string): string {
  const query = `iframe.html?id=${id}&viewMode=story`;
  if (source.kind === "url") return `${source.base}/${query}`;
  return `${pathToFileURL(join(source.base, "iframe.html")).href}?id=${id}&viewMode=story`;
}

/**
 * Enumerates non-docs stories from the resolved index. For URL sources with no
 * pre-loaded index, fetches `<base>/index.json` best-effort (returns [] on any
 * failure — never throws). Sorted by id for determinism.
 */
export async function listStories(source: StorybookSource): Promise<StoryRef[]> {
  let index = source.index;
  if (source.kind === "url" && index === null) {
    try {
      const res = await fetch(`${source.base}/index.json`);
      index = res.ok ? await res.json() : null;
    } catch {
      return [];
    }
  }
  const idx = index as { entries?: Record<string, StoryEntry>; stories?: Record<string, StoryEntry> } | null;
  const entries = idx?.entries ?? idx?.stories ?? {};
  const refs: StoryRef[] = [];
  for (const [key, entry] of Object.entries(entries)) {
    if (entry.type === "docs") continue;
    const id = entry.id ?? key;
    refs.push({ id, title: entry.title ?? "", url: storyUrl(source, id) });
  }
  return refs.sort((a, b) => a.id.localeCompare(b.id));
}
