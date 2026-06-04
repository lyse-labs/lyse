import { parse } from "@swc/core";
import type { Module, ImportDeclaration, NamedImportSpecifier, ImportDefaultSpecifier } from "@swc/core";
import type { ParsedTsFile, ImportRecord } from "../types.js";

function extToSyntax(path: string): "typescript" | "ecmascript" {
  return /\.(tsx?|jsx?)$/.test(path) ? "typescript" : "ecmascript";
}

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
      syntax: extToSyntax(path),
      tsx: /\.tsx$/.test(path),
      jsx: /\.jsx$/.test(path),
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
