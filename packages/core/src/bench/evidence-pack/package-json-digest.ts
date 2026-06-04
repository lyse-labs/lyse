import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fg from "fast-glob";
import type { PackageJsonDigest, PackageJsonDigestEntry } from "./types.js";

interface RawPackageJson {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  exports?: unknown;
}

async function readEntry(repoRoot: string, packagePath: string): Promise<PackageJsonDigestEntry | null> {
  try {
    const raw = await readFile(join(repoRoot, packagePath), "utf8");
    const parsed = JSON.parse(raw) as RawPackageJson;
    const digest: PackageJsonDigestEntry = {
      path: packagePath.replace(/\/package\.json$/, "") || ".",
      scripts: Object.keys(parsed.scripts ?? {}).sort(),
      deps: Object.keys(parsed.dependencies ?? {}).sort(),
      devDeps: Object.keys(parsed.devDependencies ?? {}).sort(),
      exports: parsed.exports ?? null,
    };
    if (parsed.name !== undefined) digest.name = parsed.name;
    if (parsed.version !== undefined) digest.version = parsed.version;
    return digest;
  } catch {
    return null;
  }
}

export async function buildPackageJsonDigest(repoRoot: string): Promise<PackageJsonDigest> {
  const root = await readEntry(repoRoot, "package.json");
  const subPaths = await fg("**/package.json", {
    cwd: repoRoot,
    ignore: [
      "**/node_modules/**",
      "package.json",
      "**/.recall-suite-cache/**",
      "**/benchmarks/fixtures/**",
      "**/fixtures/**",
      "**/.tmp/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
    ],
    onlyFiles: true,
  });
  subPaths.sort();
  const subpackages: PackageJsonDigestEntry[] = [];
  for (const sub of subPaths) {
    const entry = await readEntry(repoRoot, sub);
    if (entry !== null) subpackages.push(entry);
  }
  return { root, subpackages };
}
