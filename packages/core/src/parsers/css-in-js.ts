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

// vanilla-extract style factories take a JS object of declarations (object
// syntax, not tagged templates). We serialize that object back into CSS-ish
// text so the same hardcoded-value detectors run over `*.css.ts` files.
const VANILLA_EXTRACT_PKG = "@vanilla-extract/css";
const VANILLA_EXTRACT_FNS = new Set(["style", "styleVariants", "globalStyle", "recipe"]);

function camelToKebab(prop: string): string {
  return prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

// Recursively flatten an ObjectExpression into `prop: value;` declarations.
// Nested objects (pseudo-states, `@media`, `selectors`, recipe variants) are
// recursed so hardcoded values anywhere in the tree are surfaced; only string /
// number literal leaves become declarations.
function serializeVeObject(obj: t.ObjectExpression, out: string[]): void {
  for (const prop of obj.properties) {
    if (prop.type !== "ObjectProperty") continue;
    const value = prop.value;
    if (value.type === "ObjectExpression") {
      serializeVeObject(value, out);
      continue;
    }
    const key =
      prop.key.type === "Identifier"
        ? prop.key.name
        : prop.key.type === "StringLiteral"
          ? prop.key.value
          : null;
    if (key === null) continue;
    if (value.type === "StringLiteral") out.push(`${camelToKebab(key)}: ${value.value};`);
    else if (value.type === "NumericLiteral") out.push(`${camelToKebab(key)}: ${value.value};`);
  }
}

export function extractCssInJs(path: string, source: string): ExtractedCssInJsBlock[] {
  const blocks: ExtractedCssInJsBlock[] = [];
  // Local identifiers bound to a `styled` factory and to a `css` helper,
  // respectively — across styled-components and Emotion entry points.
  const styledNames = new Set<string>();
  const cssNames = new Set<string>();
  // Local identifiers bound to a vanilla-extract style factory.
  const veNames = new Set<string>();
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
        if (pkg === VANILLA_EXTRACT_PKG) {
          for (const spec of p.node.specifiers) {
            if (spec.type !== "ImportSpecifier") continue;
            const imported =
              spec.imported.type === "Identifier" ? spec.imported.name : spec.imported.value;
            if (VANILLA_EXTRACT_FNS.has(imported)) veNames.add(spec.local.name);
          }
          return;
        }
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
      CallExpression(p) {
        if (veNames.size === 0) return;
        const callee = p.node.callee;
        if (callee.type !== "Identifier" || !veNames.has(callee.name)) return;
        const decls: string[] = [];
        for (const arg of p.node.arguments) {
          if (arg.type === "ObjectExpression") serializeVeObject(arg, decls);
        }
        if (decls.length === 0) return;
        blocks.push({ path, line: p.node.loc?.start.line ?? 0, content: decls.join("\n") });
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
