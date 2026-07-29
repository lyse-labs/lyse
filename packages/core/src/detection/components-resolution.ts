import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ComponentInventoryEntry, ParsedFiles } from "../types.js";
import { buildComponentInventory, extractComponentProps } from "../loaders/components.js";
import type { DetectionResult } from "./types.js";

/**
 * Max parent-directory hops to walk looking for an ancestor `package.json`.
 * Matches `mcp/_find-root.ts#findProjectRoot`'s bound — deep enough for any
 * realistic monorepo nesting, shallow enough to never wander off into
 * unrelated filesystem territory above the repo.
 */
const MAX_PACKAGE_JSON_WALK_HOPS = 12;

/**
 * Resolve the `name` of the nearest-ancestor `package.json` for an absolute
 * component file path, walking up at most `MAX_PACKAGE_JSON_WALK_HOPS`
 * parent directories and stopping at the filesystem root. Returns null when
 * no ancestor has a `package.json` with a non-empty `name` — callers must
 * fall back to a known-good module rather than inventing one.
 *
 * `cache` memoises directory -> resolved name (or null) so a monorepo with
 * hundreds of components under a handful of packages reads each
 * `package.json` at most once per `buildInventoryForMode` call.
 */
function resolveOwningPackageName(absoluteFilePath: string, cache: Map<string, string | null>): string | null {
  const visited: string[] = [];
  let dir = dirname(absoluteFilePath);
  let result: string | null = null;

  for (let hop = 0; hop < MAX_PACKAGE_JSON_WALK_HOPS; hop++) {
    const cached = cache.get(dir);
    if (cached !== undefined) {
      result = cached;
      break;
    }
    visited.push(dir);

    const pkgJsonPath = join(dir, "package.json");
    if (existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as { name?: unknown };
        if (typeof pkg.name === "string" && pkg.name.length > 0) {
          result = pkg.name;
          break;
        }
      } catch {
        // Malformed package.json — treat as absent, keep walking up.
      }
    }

    const parent = dirname(dir);
    if (parent === dir) break; // filesystem root
    dir = parent;
  }

  for (const d of visited) cache.set(d, result);
  return result;
}

export function resolveComponentsModule(
  configured: string | null,
  detected: DetectionResult<string>,
): { componentsModule: string | null; dsSelfMode: boolean } {
  let componentsModule = configured;
  let dsSelfMode = false;
  if (!componentsModule) {
    componentsModule = detected.value ?? null;
    // When detection source is "workspace DS export", the repo IS the DS itself.
    // Rules like no-native-shadows and stories/coverage have consumer-of-DS semantics
    // and must skip — v0.2 will add DS-self-aware rule variants.
    if (detected.source.startsWith("workspace DS export")) {
      dsSelfMode = true;
    }
  }

  return { componentsModule, dsSelfMode };
}

export function buildInventoryForMode(input: {
  componentsModule: string | null;
  dsSelfMode: boolean;
  parsedTs: ParsedFiles["ts"];
  componentSources: Map<string, string>;
  /**
   * Optional: component name -> absolute file path. Ds-self mode ONLY: used
   * to attribute each component to its own nearest-ancestor workspace
   * package.json `name` (a monorepo has many) instead of stamping every
   * entry with the single detected/configured `componentsModule`. A name
   * absent from this map, or a file with no ancestor `package.json` carrying
   * a `name`, falls back to `componentsModule` — never invented. Omitting
   * this parameter entirely reproduces the pre-fix behavior byte-for-byte
   * (every entry gets `componentsModule`), so existing callers are unaffected.
   */
  componentFilePaths?: Map<string, string>;
}): ComponentInventoryEntry[] {
  const { componentsModule, dsSelfMode, parsedTs, componentSources, componentFilePaths } = input;
  // In dsSelfMode the DS audits its own components: they import each other via
  // relative paths so import-counting yields nothing. Build inventory directly
  // from the in-tree PascalCase source files instead (props are still extracted
  // via extractComponentProps so rules like stories/props-documented can fire).
  if (dsSelfMode && componentsModule) {
    const fallbackModule = componentsModule;
    const packageNameCache = new Map<string, string | null>();
    return [...componentSources.entries()].map(([name, src]) => {
      const filePath = componentFilePaths?.get(name);
      const owningModule = filePath ? resolveOwningPackageName(filePath, packageNameCache) : null;
      const entry: ComponentInventoryEntry = {
        name,
        module: owningModule ?? fallbackModule,
        usageCount: 0,
      };
      const props = extractComponentProps(name, src);
      if (props !== undefined) entry.props = props;
      return entry;
    });
  }
  return componentsModule ? buildComponentInventory(componentsModule, parsedTs, componentSources) : [];
}
