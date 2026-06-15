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

// Packages whose DEFAULT export is a `styled` factory (`styled.div`...``,
// `styled(Component)`...``). Emotion's `@emotion/styled` is API-identical to
// styled-components, so the same matcher covers both.
const STYLED_DEFAULT_PACKAGES = new Set(["styled-components", "@emotion/styled"]);
// Packages that export a `css` tagged-template helper (`css`...``). Named `css`
// for styled-components / @emotion/react; default or named for @emotion/css.
const CSS_HELPER_PACKAGES = new Set([
  "styled-components",
  "@emotion/react",
  "@emotion/css",
  "@emotion/core",
]);

export function extractCssInJs(path: string, source: string): ExtractedCssInJsBlock[] {
  const blocks: ExtractedCssInJsBlock[] = [];
  // Local identifiers bound to a `styled` factory and to a `css` helper,
  // respectively — across styled-components and Emotion entry points.
  const styledNames = new Set<string>();
  const cssNames = new Set<string>();
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
        const pkg = p.node.source.value;
        const isStyledPkg = STYLED_DEFAULT_PACKAGES.has(pkg);
        const isCssPkg = CSS_HELPER_PACKAGES.has(pkg);
        if (!isStyledPkg && !isCssPkg) return;
        for (const spec of p.node.specifiers) {
          if (spec.type === "ImportDefaultSpecifier") {
            if (isStyledPkg) styledNames.add(spec.local.name);
            // `import css from "@emotion/css"` — default is the css helper.
            if (pkg === "@emotion/css") cssNames.add(spec.local.name);
          } else if (spec.type === "ImportSpecifier") {
            const imported =
              spec.imported.type === "Identifier" ? spec.imported.name : spec.imported.value;
            // `import { css } from ...` / `import { css as x } from ...`
            if (imported === "css" && isCssPkg) cssNames.add(spec.local.name);
            // `import { styled } from "@emotion/react"` (named styled variant)
            if (imported === "styled") styledNames.add(spec.local.name);
          }
        }
      },
      TaggedTemplateExpression(p) {
        if (styledNames.size === 0 && cssNames.size === 0) return;
        const tag = p.node.tag;
        const matches =
          // styled.div`...`
          (tag.type === "MemberExpression" &&
            tag.object.type === "Identifier" &&
            styledNames.has((tag.object as t.Identifier).name)) ||
          // styled(Component)`...`
          (tag.type === "CallExpression" &&
            tag.callee.type === "Identifier" &&
            styledNames.has((tag.callee as t.Identifier).name)) ||
          // css`...`
          (tag.type === "Identifier" && cssNames.has((tag as t.Identifier).name));
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
