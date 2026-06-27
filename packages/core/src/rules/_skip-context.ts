/**
 * Shared skip-context helpers used by tokens/no-hardcoded-color and
 * tokens/no-hardcoded-spacing to suppress intentional false positives.
 *
 * Most helpers operate on the source string without an AST. `isInsideCodeDisplay`
 * handles both same-line and multi-line <code>/<pre> blocks via backward scan.
 * The `sizes={"..."}` JSX-expression form is still not handled — it requires
 * AST traversal to detect the expression boundary.
 */

// ---------------------------------------------------------------------------
// Color token-definition file detection
// ---------------------------------------------------------------------------

const COLOR_DEF_FILE_RE =
  /(?:^|[\\/])(?:colors|palette)\.(?:ts|js|css|scss)$|(?:^|[\\/])[^/\\]*-colors\.(?:ts|js)$|(?:^|[\\/])_legacy-colors\.(?:ts|js)$|(?:^|[\\/])[^/\\]*\.colors\.(?:ts|css|scss)$|(?:^|[\\/])demos[\\/]|(?:\.demo\.[cm]?[jt]sx?)$|(?:^|[\\/])stories[\\/][^/\\]*\.(?:css|scss)$/;

/**
 * Returns true if the file is a color token definition file, demo, or a CSS/SCSS
 * file under a stories/ directory — places where hex literals are the source of
 * truth, not drift.
 *
 * Patterns:
 *   - colors.ts / colors.js / colors.css / colors.scss (top-level or nested)
 *   - *-colors.ts / *-colors.js (e.g. brand-colors.ts, legacy-colors.ts)
 *   - _legacy-colors.ts / _legacy-colors.js
 *   - palette.ts / palette.js / palette.css / palette.scss
 *   - *.colors.ts / *.colors.css / *.colors.scss (e.g. button.colors.ts)
 *   - Files under demos/ directory
 *   - *.demo.{ts,tsx,js,jsx,mjs,cjs} files
 *   - CSS/SCSS files anywhere under stories/ (the existing guard catches *.stories.tsx
 *     for TS files, but not stories/x.module.css)
 *
 * Note: theme.ts / theme.css are intentionally excluded — they are borderline
 * (theme files can be component stylesheets, not purely token definitions).
 * The ts-morph isTokenDefinitionFile heuristic already handles TS theme files
 * with the right export shape for the classifyConfidence path.
 */
export function isColorTokenDefFile(filePath: string): boolean {
  return COLOR_DEF_FILE_RE.test(filePath);
}

// ---------------------------------------------------------------------------
// Guard A: Low-signal value file detection
// ---------------------------------------------------------------------------

const LOW_SIGNAL_FILE_RE =
  /(?:^|[\\/])(?:__tests__|__mocks__|fixtures|demos?|examples?)[\\/]|\.(?:test|spec|stories|story|demo|example|fixture)\.[cm]?[jt]sx?$/;

/**
 * Returns true if the file path is a test, story, mock, or fixture file.
 * Hardcoded values in these contexts are documentation/assertion artefacts,
 * not real design-system drift.
 */
export function isLowSignalValueFile(filePath: string): boolean {
  return LOW_SIGNAL_FILE_RE.test(filePath);
}

// ---------------------------------------------------------------------------
// Guard B: Schema / data / config / type-declaration file detection
// ---------------------------------------------------------------------------

const SCHEMA_DATA_FILE_RE =
  /(?:^|[\\/])(?:dto|schemas)[\\/]|\.(?:input|dto|schema|entity)\.(?:tsx?|jsx?)$|\.config\.(?:ts|js|mjs|cjs)$|\.d\.ts$/;

/**
 * Returns true if the file path is a NestJS DTO, JSON-schema, config, or
 * TypeScript declaration file. Hardcoded values in these roles (e.g. an
 * @ApiProperty example) are schema documentation, not DS drift.
 */
export function isSchemaOrDataFile(filePath: string): boolean {
  return SCHEMA_DATA_FILE_RE.test(filePath);
}

// ---------------------------------------------------------------------------
// Guard C: example:/default: key values and JSDoc @example block detection
// ---------------------------------------------------------------------------

const EXAMPLE_KEY_RE = /\b(example|default|placeholder|sample|mock)\s*:/;

/**
 * Returns true if the matched literal at `matchIndex` in `source` is:
 *   (a) the value of an object key named example/default/placeholder/sample/mock, OR
 *   (b) inside a JSDoc `@example` block (`/** … @example … *\/`).
 *
 * For (a): walks back from `matchIndex` to the nearest `:` at the same paren
 * depth, then checks the key name — mirroring the isCssCustomPropertyDeclaration
 * pattern.
 * For (b): checks whether the line or any preceding line (within the same
 * `/** … *\/` block) contains `@example`.
 */
export function isInExampleOrSchemaValuePosition(source: string, matchIndex: number): boolean {
  // (b) JSDoc @example: find enclosing /** … */ block and check for @example tag.
  const blockStart = source.lastIndexOf("/**", matchIndex);
  if (blockStart !== -1) {
    const blockEnd = source.indexOf("*/", blockStart);
    if (blockEnd === -1 || blockEnd > matchIndex) {
      // We're inside a /** … */ block — check if @example appears before our position
      const blockContent = source.slice(blockStart, matchIndex);
      if (blockContent.includes("@example")) return true;
    }
  }

  // (a) Object key: walk back from matchIndex to find the nearest colon
  // at depth 0 (respecting nested parens/brackets/braces), then read the key.
  let depth = 0;
  for (let i = matchIndex - 1; i >= 0; i--) {
    const c = source[i];
    if (c === ")" || c === "]" || c === "}") {
      depth++;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") {
      if (depth > 0) { depth--; continue; }
      return false; // hit a block boundary without finding a key colon
    }
    if (depth > 0) continue;
    if (c === ";" || c === "\n") return false; // statement boundary
    if (c === ":") {
      // Read the key name to the left of this colon
      const before = source.slice(0, i).trimEnd();
      // Strip trailing quote if the key is quoted
      const unquoted = before.replace(/['"`]$/, "");
      // Re-attach ":" so the regex anchored on `\s*:` can match
      const keyMatch = EXAMPLE_KEY_RE.exec(unquoted.slice(-20) + ":");
      return keyMatch !== null;
    }
  }
  return false;
}

/**
 * Returns true if the byte offset `index` in `source` falls inside a
 * `<code>...</code>` or `<pre>...</pre>` block — either on the same line or
 * across multiple lines. Useful for skipping display-only CSS examples in
 * documentation components (shadcn theme customizer pattern, Storybook docs).
 *
 * Strategy:
 *   1. Same-line check: if open+close tags bracket the position on the same
 *      line, return true immediately (fast path, no backtracking needed).
 *   2. Multi-line check: scan backwards from `index` for the nearest `<code>`
 *      or `<pre>` opening tag; if found, scan forwards for the matching close
 *      tag and verify `index` falls between them.
 *
 * Limitation: does not handle nested `<code>` inside `<code>`, or tags with
 * attributes like `<code class="language-css">`. Attributes version is a
 * common pattern — add attribute-tolerant open-tag matching.
 */
export function isInsideCodeDisplay(source: string, index: number): boolean {
  const lineStart = source.lastIndexOf("\n", index - 1) + 1;
  let lineEnd = source.indexOf("\n", index);
  if (lineEnd === -1) lineEnd = source.length;
  const line = source.slice(lineStart, lineEnd);
  const posInLine = index - lineStart;

  for (const tag of ["code", "pre"]) {
    // ── Same-line fast path ─────────────────────────────────────────────────
    const openTag = `<${tag}>`;
    const closeTag = `</${tag}>`;
    let openIdx = -1;
    while ((openIdx = line.indexOf(openTag, openIdx + 1)) !== -1) {
      const closeIdx = line.indexOf(closeTag, openIdx + openTag.length);
      if (closeIdx !== -1 && openIdx < posInLine && posInLine < closeIdx) {
        return true;
      }
    }

    // ── Multi-line check ────────────────────────────────────────────────────
    // Accept both bare `<code>` and attribute form `<code ...>` / `<code\n...>`.
    // Regex: `<tag` followed optionally by whitespace+attrs then `>`.
    const openTagRe = new RegExp(`<${tag}(?:\\s[^>]*)?>`, "g");
    // Walk backwards through all open-tag matches that precede `index`.
    // RegExp.exec scans left-to-right so collect them all then pick the last
    // one before `index`.
    openTagRe.lastIndex = 0;
    let lastOpenBeforeIndex = -1;
    let lastOpenEnd = -1;
    let m: RegExpExecArray | null;
    while ((m = openTagRe.exec(source)) !== null) {
      if (m.index >= index) break;
      lastOpenBeforeIndex = m.index;
      lastOpenEnd = m.index + m[0].length;
    }
    if (lastOpenBeforeIndex !== -1) {
      // Find the matching close tag after the open tag.
      const closeIdx = source.indexOf(closeTag, lastOpenEnd);
      if (closeIdx !== -1 && closeIdx > index) {
        // index falls between <tag...> and </tag> — it's inside a code display block.
        return true;
      }
    }
  }
  return false;
}

/**
 * JSX attributes whose string values should be excluded from spacing checks.
 * These carry responsive image / media-query breakpoint values (px, vw, etc.)
 * that are NOT design tokens.
 *
 * NOTE: the `sizes={"..."}` JSX-expression form is NOT handled by this regex.
 * V1 work — requires AST traversal to detect the expression boundary.
 */
const SKIP_JSX_ATTRS = ["sizes", "srcSet", "srcset", "media"];

/**
 * Returns true if `index` is inside the quoted value of a JSX attribute we
 * intentionally skip (sizes, srcSet, media — responsive image markup).
 */
export function isInsideSkippedJsxAttr(source: string, index: number): boolean {
  const lineStart = source.lastIndexOf("\n", index - 1) + 1;
  let lineEnd = source.indexOf("\n", index);
  if (lineEnd === -1) lineEnd = source.length;
  const line = source.slice(lineStart, lineEnd);
  const posInLine = index - lineStart;

  for (const attr of SKIP_JSX_ATTRS) {
    // Matches: attr="..." or attr='...'
    // The sizes={"..."} form requires AST — deferred to V1.
    const re = new RegExp(`${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "g");
    let am: RegExpExecArray | null;
    while ((am = re.exec(line)) !== null) {
      const value = am[1] ?? am[2] ?? "";
      const quoteIdx = am.index + am[0].indexOf(value);
      const valueStart = quoteIdx;
      const valueEnd = quoteIdx + value.length;
      if (posInLine >= valueStart && posInLine <= valueEnd) return true;
    }
  }
  return false;
}

/**
 * Returns true if the byte offset `index` falls on the right-hand side of a
 * CSS custom-property declaration (`--x: <value>`), in any selector scope.
 *
 * A value on the RHS of a custom property is, structurally, a *token
 * definition* — not drift via a hardcoded value in a real CSS property. This
 * holds whether the declaration sits in `:root` or in a component-scoped
 * `.widget { --local: 16px }` (a common pattern: define a local var, then use
 * it via `var(--local)`). The cross-tool calibration (#120) showed the prior
 * selector-scoped narrowing (Track 9.11) produced hundreds of false positives
 * on real design systems (e.g. `--heatmap-level-1: rgba(...)` in a chart
 * module), dominating the disagreement with stylelint, which never flags
 * custom-property values either.
 *
 * The remaining semantic case — "this `--x: #hex` should reference an existing
 * token rather than hardcode" — needs the token catalogue and is left to the
 * LLM filter layer, not this static guard.
 */
export function isCssCustomPropertyDeclaration(source: string, index: number): boolean {
  let colonIdx = -1;
  let depth = 0;
  for (let i = index - 1; i >= 0; i--) {
    const c = source[i];
    if (c === ")") {
      depth++;
      continue;
    }
    if (c === "(") {
      if (depth > 0) depth--;
      continue;
    }
    if (depth > 0) continue;
    if (c === ";" || c === "{" || c === "}") return false;
    if (c === ":") {
      colonIdx = i;
      break;
    }
  }
  if (colonIdx < 0) return false;

  let end = colonIdx;
  while (end > 0) {
    const c = source[end - 1] ?? "";
    if (!/\s/.test(c)) break;
    end--;
  }
  let start = end;
  while (start > 0) {
    const c = source[start - 1] ?? "";
    if (!/[a-zA-Z0-9_-]/.test(c)) break;
    start--;
  }
  const propName = source.slice(start, end);
  return propName.startsWith("--");
}

/**
 * Returns true if the literal at `index` sits in the *fallback* position of a
 * `var(--token, <fallback>)` call. Such a declaration is tokenized usage — the
 * `var()` reference is the real value; the literal only applies if the token is
 * undefined (dead code in a well-formed design system). Flagging it as drift is
 * a false positive. Handles nesting (`var(--a, var(--b, 8px))`). A literal in
 * any non-`var` function (e.g. `calc(50% - 1px)`) returns false.
 */
export function isInVarFallback(source: string, index: number): boolean {
  let depth = 0;
  let sawCommaAtLevel = false;
  for (let i = index - 1; i >= 0; i--) {
    const c = source[i];
    if (c === ")") {
      depth++;
      continue;
    }
    if (c === "(") {
      if (depth > 0) {
        depth--;
        continue;
      }
      // Enclosing open paren at our level — identify the function name.
      let start = i;
      while (start > 0 && /[a-zA-Z0-9_-]/.test(source[start - 1] ?? "")) start--;
      const fn = source.slice(start, i).toLowerCase();
      if (fn.endsWith("var")) {
        if (sawCommaAtLevel) return true;
        // First arg of var() (the token name) — not a fallback; keep climbing
        // in case of nesting like the outer var() of var(--a, var(--b, 8px)).
        sawCommaAtLevel = false;
        continue;
      }
      return false;
    }
    if (depth === 0) {
      if (c === ",") sawCommaAtLevel = true;
      else if (c === ";" || c === "{" || c === "}") return false;
    }
  }
  return false;
}

/**
 * Returns true if the offset `hitStart` falls inside a line comment, a block
 * comment, or a URL fragment — positions where a hex/px literal is not a real
 * declaration value. The SCSS transform converts `.scss` `//` comments into
 * block comments, so this also catches a value inside a former line comment.
 */
export function isInCommentOrUrl(source: string, hitStart: number): boolean {
  const lineStart = source.lastIndexOf("\n", hitStart - 1) + 1;
  const linePrefix = source.slice(lineStart, hitStart).trimStart();

  if (linePrefix.startsWith("//")) return true;
  if (linePrefix.startsWith("/*") || linePrefix.startsWith("*")) return true;

  // Multi-line block comment: inside `/* … */` if the nearest preceding `/*`
  // comes after the nearest preceding `*/` (covers continuation lines that do
  // not start with `*`, e.g. `   (-0.5px) to align. */`).
  const lastOpen = source.lastIndexOf("/*", hitStart);
  if (lastOpen !== -1) {
    const lastClose = source.lastIndexOf("*/", hitStart);
    if (lastClose < lastOpen) return true;
  }

  const lookback = source.slice(Math.max(0, hitStart - 60), hitStart);
  if (lookback.includes("://") && !/\s/.test(lookback.split("://").pop() ?? "")) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Spacing property-awareness
// ---------------------------------------------------------------------------

// CSS properties that represent spacing (margin/padding/gap/inset/position offsets).
// The rule should only fire on these, not on font-size, line-height, border-radius,
// width, height, transform, etc.
const CSS_SPACING_PROPS = new Set([
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "gap", "row-gap", "column-gap",
  "top", "right", "bottom", "left",
  "inset", "inset-block", "inset-inline",
  "inset-block-start", "inset-block-end", "inset-inline-start", "inset-inline-end",
]);

// Tailwind utility prefixes that carry spacing tokens.
// NON-spacing prefixes (text-, leading-, rounded-, w-, h-, etc.) are intentionally
// excluded so `text-[28px]` / `rounded-[10px]` / `w-[16rem]` do not fire.
const TW_SPACING_PREFIX_RE =
  /\b(?:p[xytblr]?|m[xytblr]?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|right|bottom|left)-\[/;

// Contexts that are NOT spacing: @media / @container queries (the dimension is
// a breakpoint, not a spacing token), JS media-query calls, transform functions.
const SKIP_CONTEXT_RE =
  /@media\s*\(|@container[^{]*\(|useMediaQuery\s*\(["']|matchMedia\s*\(["']|translate[XYZ]?\s*\(|translateX\s*\(|translateY\s*\(|translateZ\s*\(/;

/**
 * Returns true if the px/rem/em hit at `matchIndex` is in a CSS or JS source
 * string that is NOT a spacing property context.
 *
 * That is: returns true (= skip) when the value should NOT fire the spacing rule.
 * Returns false (= do not skip = may fire) when the value is in a spacing context.
 *
 * Spacing CSS properties: margin*, padding*, gap, row-gap, column-gap, top,
 * right, bottom, left, inset*.
 *
 * Spacing Tailwind prefixes: p-, px-, py-, pt-, pr-, pb-, pl-, m-, mx-, my-,
 * mt-, mr-, mb-, ml-, gap-, gap-x-, gap-y-, space-x-, space-y-, inset-, top-,
 * right-, bottom-, left-.
 *
 * Non-spacing (always skip): @media queries, useMediaQuery / matchMedia calls,
 * translate*()/translateX()/translateY() transform functions.
 *
 * For CSS: walks back from `matchIndex` to the nearest property colon at depth 0
 * and reads the property name.
 *
 * For Tailwind arbitrary values (`prefix-[value]`): checks the character before
 * the `[` bracket that wraps the value.
 */
export function isNotSpacingPropertyContext(source: string, matchIndex: number): boolean {
  const line = (() => {
    const ls = source.lastIndexOf("\n", matchIndex - 1) + 1;
    let le = source.indexOf("\n", matchIndex);
    if (le === -1) le = source.length;
    return source.slice(ls, le);
  })();

  // @media / transform / mediaQuery call — always non-spacing.
  if (SKIP_CONTEXT_RE.test(line)) return true;

  // Tailwind arbitrary-value check: look for `prefix-[` immediately before the value.
  // The match lands inside `prefix-[Xpx]`. Check the chars before the `[`.
  const bracketIdx = source.lastIndexOf("[", matchIndex);
  if (bracketIdx !== -1 && bracketIdx > matchIndex - 20) {
    // There is a `[` recently before the match — likely a Tailwind arbitrary value.
    const beforeBracket = source.slice(Math.max(0, bracketIdx - 30), bracketIdx);
    // Is it a spacing prefix?
    if (TW_SPACING_PREFIX_RE.test(beforeBracket + "[")) return false; // spacing — do NOT skip
    // Is it a non-spacing prefix? (text-, leading-, rounded-, w-, h-, max-w-, size-, translate-)
    const NON_SPACING_TW = /\b(?:text|leading|rounded|tracking|w|h|min-w|max-w|min-h|max-h|size|translate-[xy]?|scale|rotate|skew|basis|flex)-$/;
    if (NON_SPACING_TW.test(beforeBracket)) return true; // non-spacing — skip
    // Unknown prefix inside brackets: check for @media / transform context
    return false; // default to not skipping (may fire)
  }

  // CSS property check: walk back from matchIndex to find the property name.
  // Look for the nearest `:` at paren depth 0 before the match, then read back
  // to get the property name (stop at ; { } \n).
  let cd = 0;
  let colonPos = -1;
  for (let i = matchIndex - 1; i >= 0; i--) {
    const c = source[i];
    if (c === ")") { cd++; continue; }
    if (c === "(") { if (cd > 0) cd--; continue; }
    if (cd > 0) continue;
    // A CSS declaration ends at ; { }, NOT at a newline — values (box-shadow,
    // grid templates, multi-value margins) span lines. Walking across newlines
    // lets a continuation line resolve its real property (e.g. `box-shadow`,
    // non-spacing) instead of defaulting to "fires".
    if (c === ";" || c === "{" || c === "}") break;
    if (c === ":") { colonPos = i; break; }
  }

  if (colonPos >= 0) {
    // Read the property name before the colon.
    let pEnd = colonPos;
    while (pEnd > 0 && /\s/.test(source[pEnd - 1]!)) pEnd--;
    let pStart = pEnd;
    while (pStart > 0 && /[a-zA-Z0-9_-]/.test(source[pStart - 1]!)) pStart--;
    const prop = source.slice(pStart, pEnd).toLowerCase();
    // CSS custom property — handled by isCssCustomPropertyDeclaration; skip here
    if (prop.startsWith("--")) return false;
    // Is it a spacing property?
    if (CSS_SPACING_PROPS.has(prop)) return false; // spacing — do NOT skip
    // Non-spacing CSS property (font-size, line-height, border-radius, width, etc.)
    if (prop.length > 0) return true; // non-spacing — skip
  }

  // No CSS property or Tailwind prefix found — could be a JS variable assignment
  // or a value without clear context. Default: do not skip (conservative; fires).
  return false;
}
