import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parse as parseYaml } from "yaml";
import fg from "fast-glob";
import type { ComponentsModuleDetection, Detected, DetectionResult, WorkspacePackage } from "./types.js";
import { posixRelative } from "../util/paths.js";
import { countComponentFilesByPackage, identifyDsFamily } from "./ds-packages.js";

interface PackageJson {
  name?: string;
  private?: boolean;
  workspaces?: string[] | { packages: string[] };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  packageManager?: string;
  storybook?: unknown;
}

type Framework = "react" | "vue" | "svelte" | "solid" | "unknown";
type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

/**
 * Denylist: dev-tool namespaces that can match the UI-pattern regex but are
 * NOT component libraries.  Any dep whose name starts with one of these
 * prefixes is skipped in branch 1.
 */
const DENYLIST_PREFIXES = [
  "@vitest/",
  "@testing-library/",
  "@types/",
  "@storybook/",
  "@playwright/",
  "@swc/",
  "@eslint/",
  "@biome/",
  "@rollup/",
  "@vercel/",
  "@vitejs/",
  "@nx/",
];

export async function detectFromPackageJson(rootDir: string): Promise<Pick<Detected,
  "framework" | "hasTypeScript" | "componentsModule" | "storybook" | "packageManager"
>> {
  let pkg: PackageJson | null = null;
  try {
    pkg = JSON.parse(await readFile(join(rootDir, "package.json"), "utf8")) as PackageJson;
  } catch {
    return absentResult();
  }

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  return {
    framework: detectFramework(deps),
    hasTypeScript: detectTypeScript(deps),
    componentsModule: await detectComponentsModule(deps, pkg, rootDir),
    storybook: detectStorybook(deps, pkg),
    packageManager: detectPackageManager(pkg),
  };
}

function detectFramework(deps: Record<string, string>): DetectionResult<Framework> {
  if (deps["react"]) return { value: "react", confidence: "high", source: "react in package.json" };
  if (deps["vue"]) return { value: "vue", confidence: "high", source: "vue in package.json" };
  if (deps["svelte"]) return { value: "svelte", confidence: "high", source: "svelte in package.json" };
  if (deps["solid-js"]) return { value: "solid", confidence: "high", source: "solid-js in package.json" };
  return { value: "unknown", confidence: "low", source: "no recognized framework dep" };
}

function detectTypeScript(deps: Record<string, string>): DetectionResult<boolean> {
  const hasTs = !!deps["typescript"];
  return { value: hasTs, confidence: "high", source: hasTs ? "typescript in deps" : "no typescript in deps" };
}

async function detectComponentsModule(
  deps: Record<string, string>,
  pkg: PackageJson,
  rootDir: string,
): Promise<ComponentsModuleDetection> {
  const names = Object.keys(deps);

  // Branch 1 — internal-named UI package in deps (consumer apps / app repos).
  // Filter through denylist first to avoid false positives like @vitest/ui.
  // Skip a match that the repo OWNS (workspace protocol or a workspace member)
  // ONLY when Branch 3 (self-DS) can actually run for it (private root) —
  // otherwise Branch 3 returns null and we'd have skipped Branch 1 for nothing.
  const workspaceNames = pkg.private ? await resolveWorkspacePackageNames(pkg, rootDir) : new Set<string>();
  const internal = names.find(n => {
    if (DENYLIST_PREFIXES.some(prefix => n.startsWith(prefix))) return false;
    if (!/^@[^/]+\/(ui|components|design)/.test(n)) return false;
    const version = deps[n];
    const ownedByWorkspace = (pkg.private ?? false) && ((version?.startsWith("workspace:") ?? false) || workspaceNames.has(n));
    return !ownedByWorkspace;
  });
  if (internal) return { value: internal, confidence: "high", source: "internal-named UI package", dsSelf: false, family: [] };

  // Branch 2 — known public component libraries in deps.
  const knownLibs = ["@mui/material", "@chakra-ui/react", "@mantine/core", "antd", "@radix-ui/themes"];
  const lib = names.find(n => knownLibs.includes(n));
  if (lib) return { value: lib, confidence: "medium", source: `common UI library: ${lib}`, dsSelf: false, family: [] };

  // Branch 3 — workspace DS-self detection.
  // Applies when this IS the DS monorepo (private + workspaces at root).
  const wsResult = await detectWorkspaceDsPackage(pkg, rootDir);
  if (wsResult) return wsResult;

  return { value: null, confidence: "low", source: "no obvious componentsModule", dsSelf: false, family: [] };
}

/**
 * Attempt to read workspace globs from pnpm-workspace.yaml.
 * Returns an array of glob patterns or null if the file doesn't exist / parse.
 */
async function readPnpmWorkspaceGlobs(rootDir: string): Promise<string[] | null> {
  try {
    const raw = await readFile(join(rootDir, "pnpm-workspace.yaml"), "utf8");
    const parsed = parseYaml(raw) as { packages?: string[] } | null;
    if (parsed && Array.isArray(parsed.packages) && parsed.packages.length > 0) {
      return parsed.packages;
    }
  } catch {
    // file absent or unreadable
  }
  return null;
}

/**
 * Enumerate every workspace package (package.json `"workspaces"` or
 * pnpm-workspace.yaml `packages:`) owned by this monorepo, sorted by name and
 * deduplicated by name (two members declaring the same `"name"` — a
 * copy-pasted template, an in-progress rename — collapse to the one with the
 * lexicographically smallest `relDir`).
 *
 * `fast-glob` does not guarantee match order, so every downstream decision
 * that depends on this list's order or uniqueness — Branch 3's DS-family
 * resolution, most of all — was previously unstable across repeated runs on
 * the same repo. Sorting and deduping here is what makes those decisions
 * reproducible.
 */
export async function enumerateWorkspacePackages(pkg: PackageJson, rootDir: string): Promise<WorkspacePackage[]> {
  let globs: string[] | null = null;
  if (pkg.workspaces) {
    // Normalise workspaces to a string array (Yarn classic uses { packages: [] })
    globs = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces.packages ?? [];
  } else {
    globs = await readPnpmWorkspaceGlobs(rootDir);
  }
  if (!globs || globs.length === 0) return [];

  const pkgJsonPaths = await fg(
    globs.map(g => `${g}/package.json`),
    { cwd: rootDir, absolute: true, onlyFiles: true },
  );

  const out: WorkspacePackage[] = [];
  for (const pkgPath of pkgJsonPaths) {
    // `JSON.parse("null")` does NOT throw — it returns null. Reading `.name`
    // outside this try would crash the whole audit on a workspace member whose
    // package.json is literally `null`, where the previous code skipped it.
    try {
      const sub = JSON.parse(await readFile(pkgPath, "utf8")) as
        { name?: unknown; private?: unknown; exports?: unknown; main?: unknown; module?: unknown } | null;
      if (sub === null || typeof sub !== "object") continue;
      if (typeof sub.name !== "string" || sub.name.length === 0) continue;
      out.push({
        name: sub.name,
        relDir: posixRelative(rootDir, dirname(pkgPath)),
        private: sub.private === true,
        hasPublicEntry: sub.exports !== undefined || sub.main !== undefined || sub.module !== undefined,
      });
    } catch {
      continue;
    }
  }

  // Sort by (name, relDir): the compound key makes the order fully deterministic
  // even before dedup, independent of `fast-glob`'s unspecified return order.
  out.sort((a, b) => {
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    return a.relDir < b.relDir ? -1 : a.relDir > b.relDir ? 1 : 0;
  });

  // Two workspace members can declare the same `"name"` (a copy-pasted
  // template, an in-progress rename). Keep the first occurrence for a given
  // name — thanks to the sort above, that is deterministically the one with
  // the lexicographically smallest `relDir`, never whichever `fast-glob`
  // happened to return first.
  const deduped: WorkspacePackage[] = [];
  let lastName: string | null = null;
  for (const p of out) {
    if (p.name === lastName) continue;
    deduped.push(p);
    lastName = p.name;
  }
  return deduped;
}

/**
 * Resolve workspace globs to the set of package `name`s owned by this
 * monorepo. Used to skip workspace-owned deps in Branch 1.
 */
async function resolveWorkspacePackageNames(pkg: PackageJson, rootDir: string): Promise<Set<string>> {
  return new Set((await enumerateWorkspacePackages(pkg, rootDir)).map(p => p.name));
}

/**
 * Resolve this monorepo's design-system family from evidence — component-file
 * counts, not package names (see `ds-packages.ts#identifyDsFamily`) — and
 * return its `primary` as the componentsModule. Returns null when this repo
 * is not a private workspace root, or when no package has DS evidence.
 *
 * Supports:
 *   - package.json `"workspaces"` (npm/Yarn)
 *   - pnpm-workspace.yaml `packages:` (pnpm)
 */
async function detectWorkspaceDsPackage(
  pkg: PackageJson,
  rootDir: string,
): Promise<ComponentsModuleDetection | null> {
  if (!pkg.private) return null;

  const packages = await enumerateWorkspacePackages(pkg, rootDir);
  if (packages.length === 0) return null;

  const counts = await countComponentFilesByPackage(rootDir, packages);
  const family = identifyDsFamily(packages, counts);
  if (!family.isDesignSystem || family.primary === null) return null;

  return {
    value: family.primary,
    confidence: "high",
    source: `workspace DS family (${family.members.length} package${family.members.length === 1 ? "" : "s"}, primary ${family.primary})`,
    dsSelf: true,
    family: family.members,
  };
}

function detectStorybook(deps: Record<string, string>, pkg: PackageJson): DetectionResult<boolean> {
  const hasSbDep = Object.keys(deps).some(k => k.startsWith("@storybook/") || k === "storybook");
  if (hasSbDep) return { value: true, confidence: "high", source: "@storybook/* in deps" };
  if (pkg.storybook) return { value: true, confidence: "high", source: "storybook block in package.json" };
  return { value: false, confidence: "high", source: "no Storybook detected" };
}

function detectPackageManager(pkg: PackageJson): DetectionResult<PackageManager> {
  const pm = pkg.packageManager;
  if (pm?.startsWith("pnpm")) return { value: "pnpm", confidence: "high", source: "packageManager field" };
  if (pm?.startsWith("yarn")) return { value: "yarn", confidence: "high", source: "packageManager field" };
  if (pm?.startsWith("bun")) return { value: "bun", confidence: "high", source: "packageManager field" };
  if (pm?.startsWith("npm")) return { value: "npm", confidence: "high", source: "packageManager field" };
  return { value: "npm", confidence: "low", source: "defaulting to npm" };
}

function absentResult(): Pick<Detected, "framework" | "hasTypeScript" | "componentsModule" | "storybook" | "packageManager"> {
  const absent = <T>(value: T | null): DetectionResult<T> => ({
    value,
    confidence: "low",
    source: "package.json not found",
  });
  return {
    framework: absent<Framework>(null),
    hasTypeScript: absent<boolean>(null),
    componentsModule: { ...absent<string>(null), dsSelf: false, family: [] },
    storybook: absent<boolean>(null),
    packageManager: absent<PackageManager>(null),
  };
}
