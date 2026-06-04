import postcssScss from "postcss-scss";

const SCSS_ONLY_AT_RULES = new Set([
  "mixin", "include", "if", "else", "elseif", "for", "each", "while",
  "function", "return", "extend", "use", "forward", "warn", "error", "debug",
  "import",
]);

/**
 * Transform a `.scss` source into CSS-equivalent text that the downstream
 * Lyse pipeline (token extraction, hardcoded-value rules) can consume.
 *
 * The transform is deliberately lossy and minimal:
 * - `$variable: value;` declarations are collected into a symbol table and
 *   then dropped from the output (not valid CSS).
 * - `#{$variable}` interpolation is resolved against the symbol table. An
 *   unresolved interpolation is left as-is so the downstream rules can still
 *   surface "unknown token" findings rather than silently swallowing it.
 * - SCSS-only at-rules (`@mixin`, `@include`, `@if`, `@for`, `@use`, etc.)
 *   are stripped entirely. `@import` is also stripped — Lyse's loaders walk
 *   the file system directly, they do not follow SCSS import graphs.
 * - Nested rules are kept as-is. They yield technically invalid CSS but the
 *   downstream rule engine scans the raw source text, so hardcoded-value
 *   findings still surface on the nested declarations.
 *
 * Out of scope for v0.1:
 * - `.sass` indented syntax (postcss-scss does not parse it; the caller keeps
 *   `.sass` flagged as `skipped`).
 * - SCSS functions (`darken()`, `lighten()`, `map-get()`, etc.) — left
 *   unresolved in the output.
 * - Selector nesting flattening (post-launch follow-up).
 */
export function transformScssToCss(source: string): string {
  const root = postcssScss.parse(source);

  const scssVars = new Map<string, string>();
  root.walkDecls((decl) => {
    if (decl.prop.startsWith("$")) {
      scssVars.set(decl.prop, decl.value);
    }
  });

  const resolveInterpolation = (s: string): string =>
    s.replace(/#\{\s*(\$[\w-]+)\s*\}/g, (_, v: string) => scssVars.get(v) ?? `#{${v}}`);

  root.walkAtRules((atrule) => {
    if (SCSS_ONLY_AT_RULES.has(atrule.name)) {
      atrule.remove();
    }
  });

  root.walkDecls((decl) => {
    if (decl.prop.startsWith("$")) {
      decl.remove();
    } else {
      decl.value = resolveInterpolation(decl.value);
    }
  });

  return root.toString();
}
