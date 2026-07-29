import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { walk, DEFAULT_EXCLUDE_PATHS } from "../walker.js";
import { parseTs } from "../parsers/ts.js";
import { parseCss } from "../parsers/css.js";
import { loadStories } from "../loaders/stories.js";
import { detectFromPackageJson } from "../detection/from-package-json.js";
import { resolveComponentsModule, buildInventoryForMode, resolveComponentSources } from "../detection/components-resolution.js";
import { posixRelative } from "../util/paths.js";
import { buildDesignSystemGraph } from "./builder.js";
import { loadConfig } from "../config/schema.js";
import { normalizeTokenPackages } from "../loaders/external-tokens.js";
import type { ParsedFiles } from "../types.js";
import type { DesignSystemGraph } from "./types.js";

export async function buildGraphForRoot(root: string): Promise<DesignSystemGraph> {
  const absoluteRoot = resolve(root);
  const config = loadConfig(absoluteRoot, { onError: "degrade" });
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
  const { componentsModule, dsSelfMode } = resolveComponentsModule(
    config.designSystem?.componentsModule ?? null,
    detected.componentsModule,
  );

  const storyIndex = await loadStories(absoluteRoot);
  // componentFilePaths: absolute path per component — lets buildInventoryForMode's
  // ds-self branch attribute each component to its OWN workspace package.json
  // rather than stamping every component with the single monorepo-wide
  // componentsModule. Name collisions across files are resolved by
  // resolveComponentSources's deterministic canonical-preference order, not
  // by walk order — see its doc comment.
  const { componentSources, componentFilePaths } = resolveComponentSources(fileContents, absoluteRoot, storyIndex);
  const baseInventory = buildInventoryForMode({
    componentsModule,
    dsSelfMode,
    parsedTs: parsed.ts,
    componentSources,
    componentFilePaths,
  });

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
    tokenPackages: normalizeTokenPackages(config.designSystem?.tokenPackages),
  });
}
