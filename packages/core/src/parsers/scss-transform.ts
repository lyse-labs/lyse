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
 * CRITICAL invariant: the transform is **line-count preserving**. Output line N
 * corresponds to source line N. Downstream rules report findings by line against
 * this output, and those line numbers must match the original `.scss` source —
 * otherwise findings (and codemod edits, SARIF locations) land on the wrong
 * line. We therefore neutralize SCSS-only constructs *in place* (blanking their
 * source lines) instead of removing AST nodes and re-stringifying, which would
 * collapse lines and shift everything below.
 *
 * The transform is deliberately lossy and minimal:
 * - `$variable: value;` declarations feed a symbol table, then their source
 *   lines are blanked (kept as empty lines).
 * - `#{$variable}` interpolation is resolved against the symbol table. An
 *   unresolved interpolation is left as-is so downstream rules can still surface
 *   "unknown token" findings rather than silently swallowing it.
 * - SCSS-only at-rules (`@include`, `@if`, `@for`, `@function`, `@use`,
 *   `@import`, etc.) have their full source line range blanked.
 * - `@mixin` is special-cased: only its header line (`@mixin name(args) {`) and
 *   closing brace are blanked, so CSS-like declarations in the body (a real
 *   hardcoded-value drift surface) are still scanned. Single-line mixins
 *   collapse to one blanked line as before.
 * - `//` line comments are converted to CSS block comments in place, so a
 *   value inside a comment is not mistaken for a hardcoded-value violation.
 * - Plain rules / nested rules / plain at-rules (`@media`, `@supports`,
 *   `@keyframes`, `@theme`) are kept verbatim.
 *
 * Out of scope for v0.1:
 * - `.sass` indented syntax (postcss-scss does not parse it; the caller keeps
 *   `.sass` flagged as `skipped`).
 * - SCSS functions (`darken()`, `map-get()`, …) — left unresolved.
 * - `@function` / `@include`-content bodies (SCSS logic, not CSS declarations) —
 *   still fully blanked.
 */
export function transformScssToCss(source: string): string {
  const root = postcssScss.parse(source);

  const scssVars = new Map<string, string>();
  root.walkDecls((decl) => {
    if (decl.prop.startsWith("$")) scssVars.set(decl.prop, decl.value);
  });

  const lines = source.split("\n");
  const blankLineRange = (startLine: number, endLine: number): void => {
    for (let i = startLine; i <= endLine && i >= 1 && i <= lines.length; i++) {
      lines[i - 1] = "";
    }
  };

  // Blank SCSS-only at-rules (whole block) — line-preserving. `@mixin` is
  // special: keep the body (CSS-like declarations are a real drift surface),
  // blank only the header line and the closing brace.
  root.walkAtRules((atrule) => {
    const start = atrule.source?.start;
    const end = atrule.source?.end;
    if (!start || !end) return;
    if (atrule.name === "mixin") {
      blankLineRange(start.line, start.line);
      blankLineRange(end.line, end.line);
      return;
    }
    if (SCSS_ONLY_AT_RULES.has(atrule.name)) {
      blankLineRange(start.line, end.line);
    }
  });

  // Blank `$var:` declarations — line-preserving.
  root.walkDecls((decl) => {
    const start = decl.source?.start;
    const end = decl.source?.end;
    if (decl.prop.startsWith("$") && start && end) {
      blankLineRange(start.line, end.line);
    }
  });

  // Convert `//` line comments to block comments, in place, using the parsed
  // comment positions (so `//` inside `url(http://…)` or a string is untouched).
  root.walkComments((comment) => {
    const inline = (comment as { inline?: boolean }).inline === true ||
      (comment.raws as { inline?: boolean } | undefined)?.inline === true;
    const start = comment.source?.start;
    if (!inline || !start) return;
    const lineIdx = start.line - 1;
    const line = lines[lineIdx];
    if (line === undefined || line === "") return;
    const col = start.column - 1; // 1-based → 0-based; points at the first `/`
    if (line.slice(col, col + 2) !== "//") return;
    lines[lineIdx] = `${line.slice(0, col)}/*${line.slice(col + 2)} */`;
  });

  let out = lines.join("\n");

  // Resolve `#{$var}` interpolation (within-line; the `#{ … }` syntax does not
  // collide with URLs, so a plain global replace is safe).
  out = out.replace(/#\{\s*(\$[\w-]+)\s*\}/g, (_, v: string) => scssVars.get(v) ?? `#{${v}}`);

  return out;
}
