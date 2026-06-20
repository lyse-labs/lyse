import { existsSync, readFileSync, statSync } from "node:fs";
import { join, isAbsolute, dirname } from "node:path";
import fg from "fast-glob";
import { parse as parseBabel } from "@babel/parser";
import _traverse from "@babel/traverse";
import type { TraverseOptions } from "@babel/traverse";
import type * as t from "@babel/types";

type TraverseFn = (ast: t.Node, opts: TraverseOptions) => void;
const traverse = (
  (_traverse as unknown as { default: TraverseFn }).default ??
  (_traverse as unknown as TraverseFn)
);

const PASCAL_CASE_RE = /^[A-Z][a-zA-Z0-9]*$/;
// Component names are PascalCase AND contain a lowercase letter — this excludes
// SCREAMING_CASE / all-caps constants (DEFAULT, VERSION) that share the leading cap.
function isPascalCase(name: string): boolean {
  return PASCAL_CASE_RE.test(name) && /[a-z]/.test(name);
}

export function collectReExportedNames(source: string): { names: string[]; starFrom: string[] } {
  const names = new Set<string>();
  const starFrom: string[] = [];
  let ast: t.File;
  try {
    ast = parseBabel(source, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
      errorRecovery: false,
    });
  } catch {
    return { names: [], starFrom: [] };
  }
  try {
    traverse(ast, {
      ExportNamedDeclaration(path) {
        if (path.node.exportKind === "type") return;
        const decl = path.node.declaration;
        if (decl) {
          if (decl.type === "FunctionDeclaration" && decl.id && isPascalCase(decl.id.name)) {
            names.add(decl.id.name);
          } else if (decl.type === "VariableDeclaration") {
            for (const d of decl.declarations) {
              if (d.id.type === "Identifier" && isPascalCase(d.id.name)) names.add(d.id.name);
            }
          }
          return;
        }
        for (const spec of path.node.specifiers) {
          if (spec.type !== "ExportSpecifier") continue;
          const exportSpec = spec as t.ExportSpecifier;
          if (exportSpec.exportKind === "type") continue;
          const exported = exportSpec.exported;
          const exportedName = exported.type === "Identifier" ? exported.name : exported.value;
          if (isPascalCase(exportedName)) names.add(exportedName);
        }
      },
      ExportAllDeclaration(path) {
        if (path.node.exportKind === "type") return;
        const src = path.node.source?.value;
        if (src) starFrom.push(src);
      },
    });
  } catch {
    return { names: [], starFrom: [] };
  }
  return { names: Array.from(names), starFrom };
}

export interface PackageEntryShape {
  main?: unknown;
  module?: unknown;
  types?: unknown;
  typings?: unknown;
  exports?: unknown;
}

const CONVENTIONAL = [
  "src/index.tsx",
  "src/index.ts",
  "src/index.jsx",
  "src/index.js",
  "index.tsx",
  "index.ts",
  "index.jsx",
  "index.js",
];

function exportsDotEntry(exportsField: unknown): string | null {
  if (typeof exportsField === "string") return exportsField;
  if (exportsField && typeof exportsField === "object") {
    const dot = (exportsField as Record<string, unknown>)["."];
    const target = dot === undefined ? exportsField : dot;
    if (typeof target === "string") return target;
    if (target && typeof target === "object") {
      for (const key of ["import", "module", "default", "types"]) {
        const v = (target as Record<string, unknown>)[key];
        if (typeof v === "string") return v;
      }
    }
  }
  return null;
}

function resolveRel(packageDir: string, rel: string): string {
  return isAbsolute(rel) ? rel : join(packageDir, rel);
}

export function resolvePackageEntry(packageDir: string, pkg: PackageEntryShape): string | null {
  for (const rel of CONVENTIONAL) {
    const abs = join(packageDir, rel);
    if (existsSync(abs)) return abs;
  }
  const candidates: unknown[] = [
    pkg.module,
    pkg.main,
    pkg.types,
    pkg.typings,
    exportsDotEntry(pkg.exports),
  ];
  for (const c of candidates) {
    if (typeof c !== "string" || c.length === 0) continue;
    const abs = resolveRel(packageDir, c);
    if (existsSync(abs)) return abs;
  }
  return null;
}

const MAX_FILE_BYTES = 2_000_000;
const RESOLVE_EXTS = ["", ".tsx", ".ts", ".jsx", ".js"];
const INDEX_EXTS = ["/index.tsx", "/index.ts", "/index.jsx", "/index.js"];

function readSmall(abs: string): string | null {
  try {
    const st = statSync(abs);
    if (!st.isFile() || st.size > MAX_FILE_BYTES) return null;
    return readFileSync(abs, "utf8");
  } catch {
    return null;
  }
}

function resolveModuleFile(fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = join(dirname(fromFile), spec);
  for (const ext of RESOLVE_EXTS) {
    const abs = base + ext;
    if (readSmall(abs) !== null) return abs;
  }
  for (const ext of INDEX_EXTS) {
    const abs = base + ext;
    if (readSmall(abs) !== null) return abs;
  }
  return null;
}

function readPkg(abs: string): PackageEntryShape | null {
  const raw = readSmall(abs);
  if (raw === null || raw.trim().length === 0) return null;
  try {
    return JSON.parse(raw) as PackageEntryShape;
  } catch {
    return null;
  }
}

function toPosix(p: string): string {
  return p.split("\\").join("/");
}

export interface PublicExportIndex {
  // One entry per package, `dir` relative to repoRoot in posix form ("" = root),
  // each carrying ONLY that package's own public component names.
  packages: Array<{ dir: string; names: Set<string> }>;
}

// Resolve the public component names a single package entry exposes, following
// `export *` exactly one level. Returns the names contributed by THIS package.
function resolvePackageNames(pkgPath: string): Set<string> {
  const names = new Set<string>();
  const pkg = readPkg(pkgPath);
  if (!pkg) return names;
  const entry = resolvePackageEntry(dirname(pkgPath), pkg);
  if (!entry) return names;
  const entrySrc = readSmall(entry);
  if (entrySrc === null) return names;
  const collected = collectReExportedNames(entrySrc);
  for (const n of collected.names) names.add(n);
  for (const spec of collected.starFrom) {
    const target = resolveModuleFile(entry, spec);
    if (!target) continue;
    const tsrc = readSmall(target);
    if (tsrc === null) continue;
    for (const n of collectReExportedNames(tsrc).names) names.add(n);
  }
  return names;
}

export function resolvePublicExports(repoRoot: string): PublicExportIndex {
  const packages: PublicExportIndex["packages"] = [];
  if (!repoRoot) return { packages };
  let pkgs: string[] = [];
  try {
    pkgs = fg.sync(["**/package.json"], {
      cwd: repoRoot,
      absolute: true,
      dot: false,
      ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**"],
      followSymbolicLinks: false,
    });
  } catch {
    return { packages };
  }
  const rootPosix = toPosix(repoRoot).replace(/\/+$/, "");
  for (const pkgPath of pkgs.sort()) {
    const names = resolvePackageNames(pkgPath);
    if (names.size === 0) continue;
    const pkgDirAbs = toPosix(dirname(pkgPath));
    let rel = pkgDirAbs.startsWith(rootPosix) ? pkgDirAbs.slice(rootPosix.length) : pkgDirAbs;
    rel = rel.replace(/^\/+/, "");
    packages.push({ dir: rel, names });
  }
  return { packages };
}

// Find the names public for a file: the deepest package whose dir owns the file.
export function publicNamesForFile(index: PublicExportIndex, relFilePath: string): Set<string> {
  const file = toPosix(relFilePath).replace(/^\.?\/+/, "");
  let best: { dir: string; names: Set<string> } | null = null;
  for (const pkg of index.packages) {
    const owns = pkg.dir === "" || file === pkg.dir || file.startsWith(pkg.dir + "/");
    if (!owns) continue;
    if (best === null || pkg.dir.length > best.dir.length) best = pkg;
  }
  return best ? best.names : new Set<string>();
}

// Backward-compatible union of all packages' public names.
export function resolvePublicComponentNames(repoRoot: string): Set<string> {
  const out = new Set<string>();
  for (const pkg of resolvePublicExports(repoRoot).packages) {
    for (const n of pkg.names) out.add(n);
  }
  return out;
}
