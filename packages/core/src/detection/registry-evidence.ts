import fg from "fast-glob";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { posixRelative, toPosix } from "../util/paths.js";

/**
 * Evidence that a directory Lyse would otherwise skip is where the project
 * publishes from.
 *
 * `walker.ts` excludes `apps/docs`, `apps/www` and friends as documentation and
 * demo sites. That is right for 11 of the 12 such directories across the 58
 * checkouts available locally — and wrong for magicuidesign/magicui, which ships
 * its whole library from `apps/www/registry/` and so had all 373 of its source
 * files excluded and scanned zero. The copy-paste registry model makes that
 * layout legitimate, so the exclusion needs an escape hatch that opens on
 * evidence rather than on another directory name.
 *
 * The evidence is a shadcn-style `registry.json` whose `items[].files[].path`
 * entries resolve, **relative to the directory holding that registry.json**, to
 * real files. Resolution is the whole test, and it is what makes this usable:
 * magicui's tree holds four `registry.json` files and only one resolves. The
 * built copies under `public/` and the aggregate at the repo root are written
 * against a different base and resolve 0 of 244 and 0 of 211 — so they are
 * silently, correctly ignored, with no rule about where a registry may sit.
 *
 * Measured across the 58 local checkouts (`.bench-corpus` + the golden cache):
 * this fires on exactly one, admitting 244 files there and none anywhere else.
 */

interface RegistryFile {
  path?: unknown;
}
interface RegistryItem {
  files?: unknown;
}

function parseRegistry(file: string): RegistryItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return [];
  }
  if (parsed === null || typeof parsed !== "object") return [];
  const items = (parsed as { items?: unknown }).items;
  return Array.isArray(items) ? (items as RegistryItem[]) : [];
}

function declaredPaths(items: RegistryItem[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    if (item === null || typeof item !== "object") continue;
    if (!Array.isArray(item.files)) continue;
    for (const file of item.files as RegistryFile[]) {
      if (file === null || typeof file !== "object") continue;
      if (typeof file.path === "string" && file.path !== "") out.push(file.path);
    }
  }
  return out;
}

/**
 * Real path of `candidate` if it is a file genuinely inside `container`.
 * Resolved through symlinks on both sides: a declared path may not use `..` or
 * a symlink to reach code outside the directory that vouched for it.
 */
function containedFile(container: string, candidate: string): string | null {
  let realContainer: string;
  let realCandidate: string;
  try {
    realContainer = realpathSync(container);
    realCandidate = realpathSync(candidate);
    if (!statSync(realCandidate).isFile()) return null;
  } catch {
    return null;
  }
  const prefix = realContainer.endsWith(sep) ? realContainer : `${realContainer}${sep}`;
  return realCandidate.startsWith(prefix) ? realCandidate : null;
}

/**
 * Directories that a resolving `registry.json` names, for each directory in
 * `root` matched by `dirPatterns`. Returned relative to `root`, forward-slash,
 * sorted and de-duplicated.
 *
 * Directories rather than the individual declared files: magicui's own
 * `registry.json` omits one of the 77 components sitting beside the 76 it lists,
 * and a registry that has drifted from its directory by one file is the
 * project's bookkeeping, not a statement that the file is private.
 */
export async function registryDeclaredDirs(
  root: string,
  dirPatterns: readonly string[],
): Promise<string[]> {
  const dirs = await fg(
    dirPatterns.map((p) => p.replace(/\/\*\*$/, "")),
    { cwd: root, dot: false, followSymbolicLinks: false, onlyDirectories: true },
  );

  const named = new Set<string>();
  for (const dir of dirs) {
    const base = join(root, dir);
    const registry = join(base, "registry.json");
    for (const declared of declaredPaths(parseRegistry(registry))) {
      const file = containedFile(base, resolve(base, declared));
      if (file === null) continue;
      named.add(posixRelative(toPosix(realpathSync(root)), toPosix(dirname(file))));
    }
  }
  return [...named].sort();
}
