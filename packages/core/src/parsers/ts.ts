import { parse } from "@swc/core";
import type { Module, ImportDeclaration, NamedImportSpecifier, ImportDefaultSpecifier } from "@swc/core";
import type { ParsedTsFile, ImportRecord } from "../types.js";

// swc parses JavaScript as a subset of TypeScript, so we always select the
// TypeScript syntax (covering .ts/.tsx/.js/.jsx/.mjs/.cjs and SFC <script>
// blocks) and only toggle JSX. `tsx` must be true for JSX-bearing files —
// including `.jsx` (swc honours `tsx`, not the legacy `jsx` flag, under the
// typescript syntax) and Vue/Svelte SFC scripts (which arrive with their
// `.vue`/`.svelte` path). It must stay false for plain `.ts` so angle-bracket
// type assertions (`<T>x`, legal only outside TSX) keep parsing.
const JSX_CAPABLE_RE = /\.(tsx|jsx|vue|svelte)$/;

function isImportDeclaration(node: { type: string }): node is ImportDeclaration {
  return node.type === "ImportDeclaration";
}

function isNamedImportSpecifier(spec: { type: string }): spec is NamedImportSpecifier {
  return spec.type === "ImportSpecifier";
}

function isImportDefaultSpecifier(spec: { type: string }): spec is ImportDefaultSpecifier {
  return spec.type === "ImportDefaultSpecifier";
}

export async function parseTs(path: string, source: string): Promise<ParsedTsFile> {
  let ast: Module | null = null;
  try {
    ast = await parse(source, {
      syntax: "typescript",
      tsx: JSX_CAPABLE_RE.test(path),
      decorators: true,
      dynamicImport: true,
      target: "es2022",
    });
  } catch {
    return { path, ast: null, source, imports: [] };
  }

  const imports: ImportRecord[] = [];
  for (const node of ast.body) {
    if (!isImportDeclaration(node)) continue;
    const module = node.source.value;
    const named: string[] = [];
    let defaultImport: string | null = null;
    for (const spec of node.specifiers) {
      if (isNamedImportSpecifier(spec)) {
        named.push(spec.local.value);
      } else if (isImportDefaultSpecifier(spec)) {
        defaultImport = spec.local.value;
      }
    }
    imports.push({
      module,
      named,
      default: defaultImport,
      line: node.span ? lineFromSpan(source, node.span.start) : 0,
    });
  }

  return { path, ast, source, imports };
}

function lineFromSpan(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source.charCodeAt(i) === 10 /* \n */) line++;
  }
  return line;
}
