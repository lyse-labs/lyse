import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ComponentInventoryEntry, ParsedFiles, StoryIndex } from "../types.js";
import { buildComponentInventory, componentNameFromPath, extractComponentProps } from "../loaders/components.js";
import type { ComponentsModuleDetection, DsFamilyMember } from "./types.js";

/**
 * Max parent-directory hops to walk looking for an ancestor `package.json`.
 * Matches `mcp/_find-root.ts#findProjectRoot`'s bound — deep enough for any
 * realistic monorepo nesting, shallow enough to never wander off into
 * unrelated filesystem territory above the repo.
 */
const MAX_PACKAGE_JSON_WALK_HOPS = 12;

/** Nearest-ancestor `package.json` facts relevant to component resolution. */
interface OwningPackageInfo {
  name: string;
  private: boolean;
}

/**
 * Resolve the nearest-ancestor `package.json` (name + `private` flag) for an
 * absolute component file path, walking up at most `MAX_PACKAGE_JSON_WALK_HOPS`
 * parent directories and stopping at the filesystem root. Returns null when
 * no ancestor has a `package.json` with a non-empty `name` — callers must
 * fall back to a known-good default rather than inventing one.
 *
 * `cache` memoises directory -> resolved info (or null) so a monorepo with
 * hundreds of components under a handful of packages reads each
 * `package.json` at most once per caller.
 */
function resolveOwningPackage(absoluteFilePath: string, cache: Map<string, OwningPackageInfo | null>): OwningPackageInfo | null {
  const visited: string[] = [];
  let dir = dirname(absoluteFilePath);
  let result: OwningPackageInfo | null = null;

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
        const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as { name?: unknown; private?: unknown };
        if (typeof pkg.name === "string" && pkg.name.length > 0) {
          result = { name: pkg.name, private: pkg.private === true };
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

/** Thin projection of `resolveOwningPackage` for callers that only need the name. */
function resolveOwningPackageName(absoluteFilePath: string, cache: Map<string, OwningPackageInfo | null>): string | null {
  return resolveOwningPackage(absoluteFilePath, cache)?.name ?? null;
}

/** True when `rel` (repo-relative, `/`-separated) has a `src` path segment. */
function isUnderSrcDir(rel: string): boolean {
  return rel.split("/").includes("src");
}

/** A component-name candidate collected while scanning a repo's file contents. */
interface ComponentSourceCandidate {
  rel: string;
  absolutePath: string;
  src: string;
  strong: boolean;
}

/**
 * Decide whether `candidate` should replace `existing` as the canonical
 * source for a component name both files claim. Total, deterministic order
 * (most to least important):
 *
 *   1. A strong signal (PascalCase filename, e.g. `Button.tsx`) beats a weak
 *      one (directory-derived, e.g. `button/index.tsx`) — weak names are
 *      only admitted at all when corroborated by a matching Storybook title,
 *      so this just prefers the more direct signal among admitted names.
 *   2. A file inside a non-private package (nearest-ancestor `package.json`
 *      lacks `"private": true`) beats one inside a private package — an
 *      internal QA/tooling package must never shadow the real component it
 *      imports.
 *   3. Among equals, a path under a `src/` directory beats one that isn't.
 *   4. Among still-equals, `existing` (the first-encountered file, in walk
 *      order) is kept — never replaced — so behaviour stays deterministic
 *      without this function inventing a tie-break.
 */
function isMoreCanonical(
  candidate: ComponentSourceCandidate,
  existing: ComponentSourceCandidate,
  packageInfoCache: Map<string, OwningPackageInfo | null>,
): boolean {
  if (candidate.strong !== existing.strong) return candidate.strong;

  const candidatePrivate = resolveOwningPackage(candidate.absolutePath, packageInfoCache)?.private ?? false;
  const existingPrivate = resolveOwningPackage(existing.absolutePath, packageInfoCache)?.private ?? false;
  if (candidatePrivate !== existingPrivate) return existingPrivate;

  const candidateUnderSrc = isUnderSrcDir(candidate.rel);
  const existingUnderSrc = isUnderSrcDir(existing.rel);
  if (candidateUnderSrc !== existingUnderSrc) return candidateUnderSrc;

  return false;
}

export interface ComponentSourceResolution {
  componentSources: Map<string, string>;
  componentFilePaths: Map<string, string>;
}

/**
 * Resolve one canonical source file per component name from a repo's full
 * file contents (`rel path -> source text`), deduping name collisions with
 * the deterministic preference order documented on `isMoreCanonical` instead
 * of "whichever the walker reached first".
 *
 * Shared by both the `lyse manifest` graph build (`graph/build-io.ts`) and
 * the audit pipeline (`commands/audit-pipeline.ts`) so the two paths can
 * never resolve the same repo to different component attributions — that
 * exact divergence was a previously-fixed bug on this branch.
 */
export function resolveComponentSources(
  fileContents: Map<string, string>,
  absoluteRoot: string,
  storyIndex: StoryIndex | null,
): ComponentSourceResolution {
  const winners = new Map<string, ComponentSourceCandidate>();
  const packageInfoCache = new Map<string, OwningPackageInfo | null>();

  for (const [rel, src] of fileContents) {
    const resolved = componentNameFromPath(rel);
    if (resolved === null) continue;
    if (!resolved.strong && !storyIndex?.byTitle.has(resolved.name)) continue;

    const candidate: ComponentSourceCandidate = {
      rel,
      absolutePath: join(absoluteRoot, rel),
      src,
      strong: resolved.strong,
    };
    const existing = winners.get(resolved.name);
    if (existing === undefined || isMoreCanonical(candidate, existing, packageInfoCache)) {
      winners.set(resolved.name, candidate);
    }
  }

  const componentSources = new Map<string, string>();
  const componentFilePaths = new Map<string, string>();
  for (const [name, candidate] of winners) {
    componentSources.set(name, candidate.src);
    componentFilePaths.set(name, candidate.absolutePath);
  }
  return { componentSources, componentFilePaths };
}

export function resolveComponentsModule(
  configured: string | null,
  detected: ComponentsModuleDetection,
): { componentsModule: string | null; dsSelfMode: boolean; family: DsFamilyMember[] } {
  if (configured) return { componentsModule: configured, dsSelfMode: false, family: [] };
  // When the repo IS the DS itself (structural dsSelf flag, not source text),
  // rules like no-native-shadows and stories/coverage have consumer-of-DS
  // semantics and must skip — v0.2 will add DS-self-aware rule variants.
  return {
    componentsModule: detected.value ?? null,
    dsSelfMode: detected.dsSelf,
    family: detected.family,
  };
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
    const packageNameCache = new Map<string, OwningPackageInfo | null>();
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
