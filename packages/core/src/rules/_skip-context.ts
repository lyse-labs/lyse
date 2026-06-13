/**
 * Shared skip-context helpers used by tokens/no-hardcoded-color and
 * tokens/no-hardcoded-spacing to suppress intentional false positives.
 *
 * NOTE: All helpers are SAME-LINE heuristics only. Multi-line <code> / <pre>
 * blocks, or JSX expressions like sizes={"..."}, would require AST traversal
 * — that is V1 work.
 */

// ---------------------------------------------------------------------------
// Guard A: Low-signal value file detection
// ---------------------------------------------------------------------------

const LOW_SIGNAL_FILE_RE =
  /(?:^|[\\/])(__tests__|__mocks__|fixtures)[\\/]|\.(?:test|spec|stories|fixture)\.[cm]?[jt]sx?$/;

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
 * `<code>...</code>` or `<pre>...</pre>` block that opens AND closes on the
 * same line as the match. Useful for skipping display-only CSS examples
 * rendered by shadcn theme customizers.
 *
 * Limitation: multi-line code blocks are NOT detected. V1 needs AST context.
 */
export function isInsideCodeDisplay(source: string, index: number): boolean {
  const lineStart = source.lastIndexOf("\n", index - 1) + 1;
  let lineEnd = source.indexOf("\n", index);
  if (lineEnd === -1) lineEnd = source.length;
  const line = source.slice(lineStart, lineEnd);
  const posInLine = index - lineStart;

  for (const tag of ["code", "pre"]) {
    const openTag = `<${tag}>`;
    const closeTag = `</${tag}>`;
    let openIdx = -1;
    while ((openIdx = line.indexOf(openTag, openIdx + 1)) !== -1) {
      const closeIdx = line.indexOf(closeTag, openIdx + openTag.length);
      if (closeIdx !== -1 && openIdx < posInLine && posInLine < closeIdx) {
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
 * CSS custom-property declaration — i.e. `--<name>:` followed by the value.
 *
 * Token *definitions* (`:root { --color: #fff }`, `@theme { --space: 16px }`)
 * are the source of truth for the design system and must never be flagged
 * as hardcoded drift. The guard is property-name-based so it works regardless
 * of the enclosing selector (`:root`, `@theme`, `[data-theme=...]`, etc.).
 *
 * Walks back from `index` to the nearest declaration boundary (`;`, `{`, `}`,
 * or buffer start) skipping whitespace, then checks whether the property name
 * starts with `--`.
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
