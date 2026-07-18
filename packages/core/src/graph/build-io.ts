import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { walk, DEFAULT_EXCLUDE_PATHS } from "../walker.js";
import { parseTs } from "../parsers/ts.js";
import { parseCss } from "../parsers/css.js";
import { loadStories } from "../loaders/stories.js";
import { buildComponentInventory, componentNameFromPath } from "../loaders/components.js";
import { detectFromPackageJson } from "../detection/from-package-json.js";
import { posixRelative } from "../util/paths.js";
import { buildDesignSystemGraph } from "./builder.js";
import type { ParsedFiles } from "../types.js";
import type { DesignSystemGraph } from "./types.js";

export async function buildGraphForRoot(root: string): Promise<DesignSystemGraph> {
  const absoluteRoot = resolve(root);
  const files = await walk(absoluteRoot, { extraIgnores: [] });
  const parsed: ParsedFiles = { ts: [], css: [], cssInJs: [] };
  const fileContents = new Map<string, string>();

  for (const path of files) {
    const source = readFileSync(path, "utf8");
    const rel = posixRelative(absoluteRoot, path);
    fileContents.set(rel, source);
    if (/\.(tsx?|jsx?|mjs|cjs)$/.test(path)) parsed.ts.push(await parseTs(rel, source));
    else if (/\.(s?css)$/.test(path)) {
      const css = await parseCss(rel, source);
      if (!css.skipped) parsed.css.push(css);
    }
  }

  const detected = await detectFromPackageJson(absoluteRoot);
  const componentsModule = detected.componentsModule.value ?? null;
  const dsSelfMode = detected.componentsModule.source.startsWith("workspace DS export");

  const storyIndex = await loadStories(absoluteRoot);
  const componentSources = new Map<string, string>();
  for (const [rel, src] of fileContents) {
    const resolved = componentNameFromPath(rel);
    if (resolved === null) continue;
    if (!resolved.strong && !storyIndex?.byTitle.has(resolved.name)) continue;
    if (!componentSources.has(resolved.name)) componentSources.set(resolved.name, src);
  }
  const baseInventory = componentsModule
    ? buildComponentInventory(componentsModule, parsed.ts, componentSources)
    : [];

  return buildDesignSystemGraph({
    repoRoot: absoluteRoot,
    parsed,
    fileContents,
    componentsModule,
    dsSelfMode,
    storyIndex,
    excludePaths: [...DEFAULT_EXCLUDE_PATHS],
    baseInventory,
    componentFiles: componentSources,
  });
}
