import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { parse as parseYaml } from "yaml";
import fg from "fast-glob";
import type { ComponentsModuleDetection, Detected, DetectionResult, DsFamilyMember, WorkspacePackage } from "./types.js";
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

  // Branch 4 — the audited directory sits INSIDE a workspace whose root is
  // above it. Branch 3 needs `private: true` and a `workspaces` field, both of
  // which live on the monorepo root, so `cd packages/ui && lyse audit` reached
  // it with neither and detection returned null.
  const fromAncestor = await detectFromWorkspaceAncestor(rootDir);
  if (fromAncestor) return fromAncestor;

  return { value: null, confidence: "low", source: "no obvious componentsModule", dsSelf: false, family: [] };
}

/** Ancestors examined before giving up. Deeper than any real package nesting. */
const MAX_ANCESTOR_DEPTH = 12;

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The nearest ancestor of `startDir` that declares a workspace, or null.
 *
 * The search stops at a directory holding `.git` — checked *after* that
 * directory itself, so a normal `cd packages/ui` inside a repository still
 * finds the repository root. Without the boundary, auditing anything would
 * keep climbing and could adopt an unrelated monorepo further up as context.
 */
async function findWorkspaceAncestor(
  startDir: string,
): Promise<{ dir: string; pkg: PackageJson } | null> {
  let dir = resolve(startDir);
  if (await isDirectory(join(dir, ".git"))) return null;

  for (let depth = 0; depth < MAX_ANCESTOR_DEPTH; depth++) {
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;

    let pkg: PackageJson | null = null;
    try {
      pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8")) as PackageJson;
    } catch {
      pkg = null;
    }
    if (pkg !== null && typeof pkg === "object") {
      const declaresWorkspaces =
        pkg.workspaces !== undefined || (await readPnpmWorkspaceGlobs(dir)) !== null;
      if (declaresWorkspaces) return { dir, pkg };
    }

    if (await isDirectory(join(dir, ".git"))) return null;
  }
  return null;
}

/**
 * Resolve the design system from a workspace root above the audited directory,
 * then express the answer in the audited directory's own terms.
 *
 * Deliberately narrow: this fires only when the audited directory IS a family
 * member's own root, never when it merely sits somewhere underneath one. An
 * earlier version accepted any descendant, and `packages/core/fixtures/svelte-ds`
 * — a test fixture two levels inside this repo's own package — was then audited
 * in ds-self mode, which reclassifies its zones and silenced the token rules
 * that fixture exists to exercise. A directory inside a package is not that
 * package, and nothing structural distinguishes a vendored fixture from real
 * source. Everything else keeps its previous answer.
 *
 * `value` is the member that owns the audited directory, not the workspace
 * family's `primary`: inside `packages/icons` the answer is `@acme/icons`,
 * whatever label the monorepo as a whole would carry. `family[].relDir` is
 * measured from the audited directory, because `resolveComponentSources`
 * matches those directories against paths relative to the audit root; a member
 * outside the audited tree is dropped, since none of its files are present.
 */
async function detectFromWorkspaceAncestor(
  rootDir: string,
): Promise<ComponentsModuleDetection | null> {
  const ancestor = await findWorkspaceAncestor(rootDir);
  if (ancestor === null) return null;

  const detected = await detectWorkspaceDsPackage(ancestor.pkg, ancestor.dir);
  if (detected === null) return null;

  const absoluteRoot = resolve(rootDir);
  let owner: string | null = null;
  const family: DsFamilyMember[] = [];
  for (const member of detected.family) {
    const memberDir = resolve(ancestor.dir, member.relDir);
    if (memberDir === absoluteRoot) {
      owner = member.name;
      family.push({ name: member.name, relDir: "" });
    } else if (memberDir.startsWith(`${absoluteRoot}${sep}`)) {
      family.push({ name: member.name, relDir: posixRelative(absoluteRoot, memberDir) });
    }
  }
  if (owner === null) return null;

  return {
    value: owner,
    confidence: "high",
    source: `workspace DS family rooted at ${posixRelative(absoluteRoot, ancestor.dir) || ".."} (this package: ${owner})`,
    dsSelf: true,
    family,
  };
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

  // `fast-glob` returns absolute paths, so `relDir` must be measured against an
  // absolute root too. `posixRelative` returns its second argument unchanged
  // when the first is not a prefix of it, so a relative root yields `relDir`
  // values that are still absolute — matching no component file and no
  // disqualifier, which makes detection report "no design system" for a repo
  // that plainly has one.
  const absoluteRoot = resolve(rootDir);

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
        relDir: posixRelative(absoluteRoot, dirname(pkgPath)),
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
