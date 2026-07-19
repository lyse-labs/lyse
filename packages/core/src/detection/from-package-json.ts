import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import fg from "fast-glob";
import type { Detected, DetectionResult } from "./types.js";

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

/**
 * DS-export pattern used in workspace-walk (branch 3).
 * Matches the sub-package scoped names that typically ship a DS:
 *   @org/ui  @org/components  @org/react  @org/core  @org/primitives
 *   @org/design-system  @org/kit  @org/themes
 * Also matches bare names ending in -ui / -components / -design-system.
 */
const DS_EXPORT_RE =
  /^(@[^/]+\/(ui|components|react|core|primitives|design-system|kit|themes|material|icons|web|tokens|styles)$)|([a-z0-9-]+-(ui|components|design-system)$)/;

/**
 * Internal sub-packages that should be excluded from workspace DS detection.
 * These are tooling / test utilities that happen to live in the monorepo.
 */
const WORKSPACE_EXCLUDE_SUFFIXES = [
  "-internal",
  "-test-utils",
  "-tooling",
  "-build",
  "-scripts",
  "-codemods",
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
): Promise<DetectionResult<string>> {
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
  if (internal) return { value: internal, confidence: "high", source: "internal-named UI package" };

  // Branch 2 — known public component libraries in deps.
  const knownLibs = ["@mui/material", "@chakra-ui/react", "@mantine/core", "antd", "@radix-ui/themes"];
  const lib = names.find(n => knownLibs.includes(n));
  if (lib) return { value: lib, confidence: "medium", source: `common UI library: ${lib}` };

  // Branch 3 — workspace DS-self detection.
  // Applies when this IS the DS monorepo (private + workspaces at root).
  const wsResult = await detectWorkspaceDsPackage(pkg, rootDir);
  if (wsResult) return wsResult;

  return { value: null, confidence: "low", source: "no obvious componentsModule" };
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
 * Resolve workspace globs (package.json `"workspaces"` or pnpm-workspace.yaml)
 * to the set of package `name`s owned by this monorepo. Used both to skip
 * workspace-owned deps in Branch 1 and to walk sub-packages in Branch 3.
 */
async function resolveWorkspacePackageNames(pkg: PackageJson, rootDir: string): Promise<Set<string>> {
  const names = new Set<string>();

  let globs: string[] | null = null;
  if (pkg.workspaces) {
    // Normalise workspaces to a string array (Yarn classic uses { packages: [] })
    globs = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces.packages ?? [];
  } else {
    globs = await readPnpmWorkspaceGlobs(rootDir);
  }
  if (!globs || globs.length === 0) return names;

  const pkgJsonPaths = await fg(
    globs.map(g => `${g}/package.json`),
    { cwd: rootDir, absolute: true, onlyFiles: true },
  );

  for (const pkgPath of pkgJsonPaths) {
    try {
      const sub = JSON.parse(await readFile(pkgPath, "utf8")) as { name?: string };
      if (sub.name) names.add(sub.name);
    } catch {
      // skip unreadable
    }
  }

  return names;
}

/**
 * Walk workspace sub-packages and look for one whose `name` matches the
 * DS-export pattern.  Returns a DetectionResult or null if nothing found.
 *
 * Supports:
 *   - package.json `"workspaces"` (npm/Yarn)
 *   - pnpm-workspace.yaml `packages:` (pnpm)
 */
async function detectWorkspaceDsPackage(
  pkg: PackageJson,
  rootDir: string,
): Promise<DetectionResult<string> | null> {
  if (!pkg.private) return null;

  const names = await resolveWorkspacePackageNames(pkg, rootDir);

  for (const name of names) {
    // Skip known internal/tooling packages
    if (WORKSPACE_EXCLUDE_SUFFIXES.some(suffix => name.endsWith(suffix))) continue;

    if (DS_EXPORT_RE.test(name)) {
      return { value: name, confidence: "high", source: `workspace DS export (${name})` };
    }
  }

  return null;
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
    componentsModule: absent<string>(null),
    storybook: absent<boolean>(null),
    packageManager: absent<PackageManager>(null),
  };
}
