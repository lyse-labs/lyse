import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import type { TraverseOptions } from "@babel/traverse";
import type * as t from "@babel/types";
import type { ExtractedCssInJsBlock } from "../types.js";

type TraverseFn = (ast: t.Node, opts: TraverseOptions) => void;

// Babel CJS-vs-ESM interop: the callable lives at .default in some environments.
const traverse = (
  (_traverse as unknown as { default: TraverseFn }).default ??
  (_traverse as unknown as TraverseFn)
);

const STYLED_PACKAGE = "styled-components";

export function extractCssInJs(path: string, source: string): ExtractedCssInJsBlock[] {
  const blocks: ExtractedCssInJsBlock[] = [];
  let stylesImported: string | null = null;
  let ast;
  try {
    ast = parse(source, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
      errorRecovery: true,
    });
  } catch {
    return blocks;
  }

  try {
    traverse(ast, {
      ImportDeclaration(p) {
        if (p.node.source.value === STYLED_PACKAGE) {
          for (const spec of p.node.specifiers) {
            if (spec.type === "ImportDefaultSpecifier") {
              stylesImported = spec.local.name;
            }
          }
        }
      },
      TaggedTemplateExpression(p) {
        if (!stylesImported) return;
        const tag = p.node.tag;
        const matches =
          // styled.div`...`
          (tag.type === "MemberExpression" &&
            tag.object.type === "Identifier" &&
            (tag.object as t.Identifier).name === stylesImported) ||
          // styled(Component)`...`
          (tag.type === "CallExpression" &&
            tag.callee.type === "Identifier" &&
            (tag.callee as t.Identifier).name === stylesImported);
        if (!matches) return;

        const quasi = p.node.quasi;
        const parts: string[] = [];
        for (let i = 0; i < quasi.quasis.length; i++) {
          // Loop bound guarantees quasi.quasis[i] exists; non-null assert is safe.
          parts.push(quasi.quasis[i]!.value.raw);
          if (i < quasi.expressions.length) parts.push("__EXPR__");
        }
        const content = parts.join("");
        const line = quasi.loc?.start.line ?? 0;
        blocks.push({ path, line, content });
      },
    });
  } catch {
    // Babel traverse can throw on pathological ASTs (e.g. duplicate declarations
    // in Carbon's generated JS). Return whatever blocks we extracted so far.
    process.stderr.write(`[lyse] Warning: babel traverse error in file, skipping: ${path}\n`);
    return blocks;
  }

  return blocks;
}
