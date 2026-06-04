import { existsSync, readFileSync, readdirSync } from "node:fs";
import type { Dirent } from "node:fs";
import { join } from "node:path";

export type Framework = "react" | "vue" | "solid" | "svelte" | "unknown";
export type Styling =
  | "tailwind-v4"
  | "tailwind-v3"
  | "css-modules"
  | "vanilla-extract"
  | "emotion"
  | "styled-components"
  | "unknown";
export type TestRunner = "vitest" | "jest" | "playwright" | "none";

export interface StackDetection {
  framework: Framework;
  styling: Styling;
  hasTypeScript: boolean;
  testRunners: TestRunner[];
}

interface PackageJsonLike {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export function detectStack(repoRoot: string): StackDetection {
  const pkg = readPackageJson(repoRoot);
  const deps = mergeDeps(pkg);
  return {
    framework: detectFramework(deps),
    styling: detectStyling(deps, repoRoot),
    hasTypeScript: existsSync(join(repoRoot, "tsconfig.json")) || "typescript" in deps,
    testRunners: detectTestRunners(deps),
  };
}

export function readPackageJson(repoRoot: string): PackageJsonLike {
  try {
    return JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as PackageJsonLike;
  } catch {
    return {};
  }
}

export function mergeDeps(pkg: PackageJsonLike): Record<string, string> {
  return { ...pkg.dependencies, ...pkg.devDependencies };
}

export function detectFramework(deps: Record<string, string>): Framework {
  if ("react" in deps) return "react";
  if ("vue" in deps) return "vue";
  if ("solid-js" in deps) return "solid";
  if ("svelte" in deps) return "svelte";
  return "unknown";
}

export function detectStyling(deps: Record<string, string>, repoRoot: string): Styling {
  const tw = deps["tailwindcss"];
  if (tw) {
    if (isTailwindV4(tw) || hasTailwindV4CssEntry(repoRoot)) return "tailwind-v4";
    return "tailwind-v3";
  }
  if ("@vanilla-extract/css" in deps) return "vanilla-extract";
  if ("@emotion/react" in deps || "@emotion/styled" in deps) return "emotion";
  if ("styled-components" in deps) return "styled-components";
  if (hasCssModuleFile(repoRoot)) return "css-modules";
  return "unknown";
}

function isTailwindV4(versionRange: string): boolean {
  const m = versionRange.match(/(\d+)/);
  if (!m || !m[1]) return false;
  return parseInt(m[1], 10) >= 4;
}

function hasTailwindV4CssEntry(repoRoot: string): boolean {
  const candidates = [
    "app.css",
    "globals.css",
    "src/app.css",
    "src/globals.css",
    "src/styles/globals.css",
    "styles/globals.css",
    "app/globals.css",
  ];
  for (const c of candidates) {
    const p = join(repoRoot, c);
    if (!existsSync(p)) continue;
    try {
      const css = readFileSync(p, "utf8");
      if (/@import\s+["']tailwindcss["']/.test(css) || /@theme\b/.test(css)) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

function hasCssModuleFile(repoRoot: string): boolean {
  const probes = ["src", "app", "components"];
  for (const p of probes) {
    const root = join(repoRoot, p);
    if (!existsSync(root)) continue;
    if (scanForCssModule(root, 3)) return true;
  }
  return false;
}

function scanForCssModule(dir: string, depth: number): boolean {
  if (depth < 0) return false;
  let entries: Dirent[] = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    if (e.isFile() && /\.module\.(css|scss|sass)$/.test(e.name)) return true;
    if (e.isDirectory() && scanForCssModule(join(dir, e.name), depth - 1)) return true;
  }
  return false;
}

export function detectTestRunners(deps: Record<string, string>): TestRunner[] {
  const runners: TestRunner[] = [];
  if ("vitest" in deps) runners.push("vitest");
  if ("jest" in deps || "@jest/core" in deps) runners.push("jest");
  if ("@playwright/test" in deps || "playwright" in deps) runners.push("playwright");
  return runners.length > 0 ? runners : ["none"];
}
