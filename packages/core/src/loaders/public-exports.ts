import { existsSync } from "node:fs";
import { join, isAbsolute } from "node:path";
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
