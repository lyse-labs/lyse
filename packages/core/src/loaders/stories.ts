import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import fg from "fast-glob";
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import type { TraverseOptions } from "@babel/traverse";
import type * as t from "@babel/types";
import type { StoryIndex, StoryEntry, StoryExport } from "../types.js";

type TraverseFn = (ast: t.Node, opts: TraverseOptions) => void;

// Babel CJS-vs-ESM interop: the callable lives at .default in some environments.
const traverse = (
  (_traverse as unknown as { default: TraverseFn }).default ??
  (_traverse as unknown as TraverseFn)
);

interface SbEntry { type: string; title: string; importPath: string; id: string }
interface SbIndex { v: number; entries: Record<string, SbEntry> }

/**
 * Extract a simple literal value (string | number | boolean) from an AST node.
 * Returns undefined for complex expressions (template literals, function calls, etc.).
 */
function extractLiteralValue(node: t.Node): string | number | boolean | undefined {
  if (node.type === "StringLiteral") return (node as t.StringLiteral).value;
  if (node.type === "NumericLiteral") return (node as t.NumericLiteral).value;
  if (node.type === "BooleanLiteral") return (node as t.BooleanLiteral).value;
  return undefined;
}

/**
 * Extract simple literal args from an ObjectExpression.
 * Only { key: literal } properties are extracted — computed keys, spread, or complex
 * values are silently skipped (better to under-extract than mis-extract).
 */
function extractArgs(obj: t.ObjectExpression): Record<string, string | number | boolean> {
  const args: Record<string, string | number | boolean> = {};
  for (const prop of obj.properties) {
    if (prop.type !== "ObjectProperty") continue;
    const objProp = prop as t.ObjectProperty;
    // Skip computed properties ([key]: value)
    if (objProp.computed) continue;
    // Extract the key as a string
    let key: string | undefined;
    if (objProp.key.type === "Identifier") {
      key = (objProp.key as t.Identifier).name;
    } else if (objProp.key.type === "StringLiteral") {
      key = (objProp.key as t.StringLiteral).value;
    }
    if (!key) continue;
    const val = extractLiteralValue(objProp.value as t.Node);
    if (val !== undefined) {
      args[key] = val;
    }
  }
  return args;
}

/**
 * Parse a single story file (CSF v3) and extract:
 * - componentName from `export default { component: Button }`
 * - named story exports and their args from `export const Primary = { args: { variant: "primary" } }`
 *
 * Returns undefined on parse failure.
 *
 * Limitation: factory-pattern stories (`export const Primary = makeStory(...)`)
 * are skipped — the function call's args are too varied to safely extract.
 * Cross-file variable references in `component:` are not resolved (v0.2).
 */
function parseStoryFile(source: string): { componentName?: string; stories: StoryExport[] } | undefined {
  let ast: t.File;
  try {
    ast = parse(source, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
      errorRecovery: true,
    });
  } catch {
    return undefined;
  }

  let componentName: string | undefined;
  const stories: StoryExport[] = [];

  try {
    traverse(ast, {
      // Extract default export: `export default { component: Button, title: "..." }`
      ExportDefaultDeclaration(path) {
        const decl = path.node.declaration;
        if (decl.type !== "ObjectExpression") return;
        const obj = decl as t.ObjectExpression;
        for (const prop of obj.properties) {
          if (prop.type !== "ObjectProperty") continue;
          const objProp = prop as t.ObjectProperty;
          if (objProp.computed) continue;
          if (objProp.key.type !== "Identifier") continue;
          const keyName = (objProp.key as t.Identifier).name;
          if (keyName === "component") {
            // Only capture direct identifier references, not expressions
            if (objProp.value.type === "Identifier") {
              componentName = (objProp.value as t.Identifier).name;
            }
          }
        }
      },

      // Extract named exports: `export const Primary = { args: { variant: "primary" } }`
      // Also handles: `export const Primary: StoryObj = { args: {...} }` (TS type annotation)
      ExportNamedDeclaration(path) {
        const decl = path.node.declaration;
        if (!decl) return;
        if (decl.type !== "VariableDeclaration") return;
        const varDecl = decl as t.VariableDeclaration;
        for (const declarator of varDecl.declarations) {
          if (declarator.id.type !== "Identifier") continue;
          const exportName = (declarator.id as t.Identifier).name;
          // Skip `default` re-export patterns
          if (exportName === "default") continue;

          const init = declarator.init;
          if (!init) continue;

          // Skip factory calls: `makeStory(...)`, `defineMeta(...)`, etc.
          // Only extract plain object expressions.
          if (init.type !== "ObjectExpression") continue;

          const storyObj = init as t.ObjectExpression;
          let args: Record<string, string | number | boolean> | undefined;

          // Look for `args:` property in the story object
          for (const prop of storyObj.properties) {
            if (prop.type !== "ObjectProperty") continue;
            const objProp = prop as t.ObjectProperty;
            if (objProp.computed) continue;
            if (objProp.key.type !== "Identifier") continue;
            if ((objProp.key as t.Identifier).name !== "args") continue;
            if (objProp.value.type === "ObjectExpression") {
              args = extractArgs(objProp.value as t.ObjectExpression);
            }
          }

          const storyExport: StoryExport = {
            name: exportName,
            ...(args !== undefined && Object.keys(args).length > 0 && { args }),
          };
          stories.push(storyExport);
        }
      },
    });
  } catch {
    // Partial extraction is fine — return what we got
  }

  return {
    ...(componentName !== undefined && { componentName }),
    stories,
  };
}

export async function loadStories(root: string): Promise<StoryIndex | null> {
  const indexPath = join(root, "storybook-static", "index.json");
  if (existsSync(indexPath)) {
    try {
      const data = JSON.parse(readFileSync(indexPath, "utf8")) as SbIndex;
      const byTitle = new Map<string, StoryEntry>();
      // Group entries by title leaf so we can aggregate story exports per component
      const titleToEntries = new Map<string, SbEntry[]>();
      for (const e of Object.values(data.entries)) {
        if (e.type !== "story") continue;
        const leaf = e.title.split("/").pop() ?? e.title;
        if (!titleToEntries.has(leaf)) titleToEntries.set(leaf, []);
        titleToEntries.get(leaf)!.push(e);
      }
      for (const [leaf, entries] of titleToEntries) {
        // Use the first entry's importPath to parse the story file
        const firstEntry = entries[0]!;
        const importPath = firstEntry.importPath;
        const storyEntry: StoryEntry = { id: firstEntry.id, importPath };

        // Attempt to parse the source file for CSF v3 exports
        const absPath = join(root, importPath);
        if (existsSync(absPath)) {
          const src = readFileSync(absPath, "utf8");
          const parsed = parseStoryFile(src);
          if (parsed) {
            if (parsed.componentName !== undefined) {
              storyEntry.componentName = parsed.componentName;
            }
            if (parsed.stories.length > 0) {
              storyEntry.stories = parsed.stories;
            }
          }
        }

        byTitle.set(leaf, storyEntry);
      }
      if (byTitle.size > 0) return { byTitle };
    } catch { /* fall through */ }
  }

  const files = await fg(["**/*.stories.{ts,tsx,js,jsx}"], { cwd: root, absolute: true, ignore: ["**/node_modules/**"] });
  if (files.length === 0) return null;
  const byTitle = new Map<string, StoryEntry>();
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    const titleMatch = src.match(/title\s*:\s*["'`]([^"'`]+)["'`]/);
    if (!titleMatch || !titleMatch[1]) continue;
    const leaf = titleMatch[1].split("/").pop() ?? titleMatch[1];
    // Normalize to a posix-style import path: fast-glob returns "/" paths but
    // `root` uses the OS separator, so a naive `replace(root + "/")` leaves the
    // path absolute on Windows. `relative` + "/"-join is cross-platform.
    const importPath = relative(root, f).split(/[\\/]/).join("/");
    const storyEntry: StoryEntry = {
      id: leaf.toLowerCase(),
      importPath,
    };

    // Parse CSF v3 exports from source
    const parsed = parseStoryFile(src);
    if (parsed) {
      if (parsed.componentName !== undefined) {
        storyEntry.componentName = parsed.componentName;
      }
      if (parsed.stories.length > 0) {
        storyEntry.stories = parsed.stories;
      }
    }

    byTitle.set(leaf, storyEntry);
  }
  return byTitle.size > 0 ? { byTitle } : null;
}
