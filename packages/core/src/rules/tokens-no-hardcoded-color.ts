import { isAbsolute, join } from "node:path";
import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding, ClassifyContext, Confidence, CodemodContext, CodemodResult, FixGroup } from "../types.js";
import { isInsideCodeDisplay, isCssCustomPropertyDeclaration, isLowSignalValueFile, isSchemaOrDataFile, isInExampleOrSchemaValuePosition, isColorTokenDefFile, isInCommentOrUrl, isVendoredOrResetFile, isSvgIconContext, isDataPaletteContext, isGeneratedCssSource } from "./_skip-context.js";
import { isPathExcluded } from "./_exclude.js";
import { fixHardcodedColor } from "../codemods/tokens-color.js";
import { adaptOldCodemodResult } from "./_codemod-adapter.js";
import { createLyseRule } from "./_rule-module.js";
import { getTsMorphProject } from "../parsers/ts-morph-project.js";
import { makeFixGroup } from "./_fix-group.js";
import { classifyColorRole } from "./_color-ast-role.js";
import { isScored, reverseLookup } from "../graph/query.js";
import type { Resolution } from "../graph/resolve/types.js";

// Allow one level of nested parens so hsl(var(--token)) is captured whole.
// Pattern: (?:[^)(]|\([^)]*\))* matches any mix of non-paren chars and
// single-level nested groups.
const COLOR_FUNC =
  /(#([0-9a-fA-F]{3,4}){1,2})\b|rgb[a]?\((?:[^)(]|\([^)]*\))*\)|hsl[a]?\((?:[^)(]|\([^)]*\))*\)|oklch\((?:[^)(]|\([^)]*\))*\)/g;
const TW_ARBITRARY = /\b(bg|text|border|fill|stroke|ring|shadow|from|to|via|outline|caret|accent|decoration|divide|placeholder)-\[#[0-9a-fA-F]{3,8}\]/g;

const ALLOWLIST = new Set(["currentColor", "transparent", "inherit", "initial", "unset", "none", "auto"]);

/**
 * Matches color function calls whose ENTIRE argument is a CSS variable
 * reference — e.g. hsl(var(--background)), rgba(var(--brand), 0.5),
 * oklch(var(--c)). These are token USES (shadcn/radix theming pattern), not
 * hardcoded colors.
 *
 * The regex allows an optional alpha comma-arg: var(--x), 0.5
 */
const COLOR_VAR_REF =
  /^(?:hsl[a]?|rgb[a]?|oklch)\(\s*var\(--[a-zA-Z0-9_-]+\)(?:\s*,\s*[^)]+)?\s*\)$/;

/**
 * Returns true when the color function's first argument is a non-literal
 * (an identifier, member-access expression, function call, or the `from`
 * keyword used in CSS relative-color syntax like `oklch(from var(--x) l c h)`).
 *
 * A literal argument starts with a digit, '+', '-', or '.' (numeric), or '#'
 * (inline hex, unusual but possible). Any other leading character means the
 * argument is a JS/TS expression or CSS keyword — the color value comes from
 * a token/variable reference, so the rule MUST NOT flag it.
 *
 * Examples that return true (must skip):
 *   rgba(theme.colors.blue[6], 0.2)  → first arg starts with 't' → identifier
 *   rgba(lightParsed.value, 0.07)    → first arg starts with 'l' → identifier
 *   oklch(from var(--primary) l c h) → first arg starts with 'f' ('from')
 *
 * Examples that return false (must flag):
 *   rgba(255, 255, 255, 0.5)         → first arg '255' → digit → literal
 *   hsl(217, 83%, 53%)               → first arg '217' → digit → literal
 *   oklch(0.65 0.2 240)              → first arg '0.65' → digit → literal
 *
 * This check is purely syntactic — it never uses file paths, identifier names,
 * or repo-specific knowledge. It generalises across all codebases.
 */
function colorFnHasNonLiteralArg(match: string): boolean {
  // Hex literals are handled by the COLOR_FUNC regex separately — they have no
  // parens, so this function is never called for them. Guard anyway.
  if (match.startsWith("#")) return false;

  const parenOpen = match.indexOf("(");
  if (parenOpen === -1) return false;

  // Extract content between the outer parens (no inner-paren awareness needed
  // because we only inspect the first character of the first argument).
  const inner = match.slice(parenOpen + 1, match.lastIndexOf(")")).trimStart();
  if (inner.length === 0) return false;

  const firstChar = inner[0]!;
  // Literals start with a digit, sign, decimal point, or '#' (embedded hex).
  // Anything else is a letter/underscore → identifier, keyword ('from'),
  // or function reference — i.e. a non-literal reference expression.
  return /[a-zA-Z_]/.test(firstChar);
}

function shouldSkip(value: string): boolean {
  return ALLOWLIST.has(value.trim());
}

/**
 * Reads the function name immediately before the opening paren at `parenIdx`.
 * E.g. for "var(" it returns "var", for "linear-gradient(" it returns "linear-gradient".
 */
function readFunctionNameBackwards(source: string, parenIdx: number): string {
  const end = parenIdx; // exclusive — the char at parenIdx is '('
  // walk back over identifier chars (letters, digits, hyphens)
  let i = end - 1;
  while (i >= 0 && /[a-zA-Z0-9_-]/.test(source[i]!)) {
    i--;
  }
  return source.slice(i + 1, end);
}

/**
 * Returns true if the hit at `hitStart` is nested inside a `var(...)` call.
 * Walks backwards counting unmatched parens; when the first unmatched opening
 * paren is found, checks whether it belongs to a `var` call.
 *
 * Handles:
 *   var(--token, #hex)              → true
 *   var(--a, var(--b, #hex))        → true (inner var is the unmatched paren)
 *   linear-gradient(red, #hex)      → false (outer = linear-gradient)
 *   linear-gradient(r, var(--v, #h), b) → true (outer of #h is var)
 */
function isInsideVarCall(source: string, hitStart: number): boolean {
  let depth = 0;
  for (let i = hitStart - 1; i >= 0; i--) {
    const c = source[i];
    if (c === ")") {
      depth++;
    } else if (c === "(") {
      if (depth === 0) {
        // found the first unmatched opening paren — check its function name
        const funcName = readFunctionNameBackwards(source, i);
        return funcName === "var";
      }
      depth--;
    }
  }
  return false;
}

/**
 * Returns true if the hex hit at `hitStart` in `source` is inside a CSS
 * attribute selector `[attr="value"]` — i.e. between an unmatched `[` and its
 * matching `]` before the next `{`.
 *
 * Examples that return true (NOT a declared color — suppress):
 *   [stroke='#ccc'] { ... }
 *   [data-color="#fff"] { color: inherit; }
 *   svg [fill='#abc123'] path { opacity: 1; }
 *
 * Examples that return false (real declarations — do not suppress):
 *   .icon { stroke: #ccc; }
 *   .x { color: #ccc; }
 *
 * Strategy: walk backwards from `hitStart`. If we first hit `[` (unmatched)
 * before hitting `{`, `;`, or end-of-content, and the `]` closing that `[`
 * appears after `hitStart` (and before any `{`), the hex is selector-internal.
 */
function isInsideCssAttributeSelector(source: string, hitStart: number): boolean {
  let depth = 0;
  for (let i = hitStart - 1; i >= 0; i--) {
    const c = source[i];
    if (c === "]") {
      depth++;
      continue;
    }
    if (c === "[") {
      if (depth > 0) {
        depth--;
        continue;
      }
      // Unmatched `[` found — now verify its `]` comes after hitStart
      // and before any `{` (confirming this is a selector, not CSS value).
      for (let j = hitStart; j < source.length; j++) {
        const d = source[j];
        if (d === "]") return true;  // closing bracket after our hit → selector
        if (d === "{") return false; // rule body opened → not in selector
      }
      return false;
    }
    // Rule body boundary or statement end — we're inside a CSS rule, not a selector.
    if (c === "{" || c === "}" || c === ";") return false;
  }
  return false;
}

function matchCount(source: string, pattern: RegExp): number {
  pattern.lastIndex = 0;
  const matches = source.match(pattern);
  return matches ? matches.length : 0;
}

// ---------------------------------------------------------------------------
// Tailwind default color palette — static list, no eval risk.
// Covers all named colors in Tailwind v3/v4 default theme.
// ---------------------------------------------------------------------------
const TW_COLOR_NAMES = [
  "slate", "gray", "zinc", "neutral", "stone",
  "red", "orange", "amber", "yellow", "lime",
  "green", "emerald", "teal", "cyan", "sky",
  "blue", "indigo", "violet", "purple", "fuchsia",
  "pink", "rose",
];
const TW_COLOR_SHADES = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];

// e.g. bg-slate-900, text-red-500, border-blue-200
const TW_COLOR_PREFIXES = "bg|text|border|ring|fill|stroke|divide|decoration|outline";
const TW_NAMED_SCALE = `(?:${TW_COLOR_NAMES.join("|")})-(?:${TW_COLOR_SHADES.join("|")})`;
// Build the regex string
const TW_COLOR_UTILITY_RE = new RegExp(
  `\\b(?:${TW_COLOR_PREFIXES})-(?:${TW_NAMED_SCALE}|white|black|transparent|current|inherit)\\b`,
  "g",
);
// Simple special cases: bg-white, text-transparent, etc. (already covered above via the trailing alternation)

/**
 * Counts compliant (tokenized) color usages that should be counted as
 * opportunities without being counted as findings. This gives the score
 * formula a proper denominator so compliant repos score > 0.
 *
 * Counts:
 *  - hsl/hsla/rgb/rgba/oklch wrapping a var() ref (CSS variable theming pattern)
 *  - standalone var(--token) in CSS declaration position
 *  - theme.colors.X / theme.palette.X / palette.X.Y / tokens.color.X in TS/TSX/JSX
 *  - Tailwind utility color classes: bg-slate-900, text-white, border-red-500, etc.
 */
export function countCompliantColorUses(source: string, fileExt: string): number {
  let count = 0;

  // Pattern 1: hsl(var(...)), rgba(var(...)), oklch(var(...)), etc.
  count += matchCount(source, /\b(?:hsl[a]?|rgb[a]?|oklch)\s*\(\s*var\(/g);

  // Pattern 2: standalone `var(--token)` in CSS declaration value position
  // Matches `: var(--foo)` followed by ; or } (skips hsl(var()) which pattern 1 already handles)
  if (fileExt === ".css" || fileExt === ".scss") {
    count += matchCount(source, /:\s*var\(--[a-zA-Z][\w-]*\)\s*[;},]/g);
  }

  // Pattern 3: theme.colors.X / theme.palette.X / palette.X.Y / tokens.color.X in TS/JSX
  if (fileExt === ".ts" || fileExt === ".tsx" || fileExt === ".jsx" || fileExt === ".js") {
    count += matchCount(source, /\btheme\.(?:colors|palette)\.[\w.[\]'"`]+/g);
    count += matchCount(source, /\btokens\.color\.[\w.[\]'"`]+/g);
    count += matchCount(source, /\bpalette\.[\w]+\.\w+/g);
  }

  // Pattern 4: Tailwind utility color classes in TSX/JSX/TS/JS files
  // bg-slate-900, text-white, border-red-500, ring-blue-200, etc.
  if (fileExt === ".ts" || fileExt === ".tsx" || fileExt === ".jsx" || fileExt === ".js") {
    TW_COLOR_UTILITY_RE.lastIndex = 0;
    count += matchCount(source, TW_COLOR_UTILITY_RE);
  }

  return count;
}

/**
 * Returns true if the hex match at `hitIndex` in `source` is actually an HTML
 * numeric character entity (`&#NNN;` or `&#xNN;`). These look like `#NNN` to
 * the COLOR_FUNC hex regex but are NOT CSS color values — they are HTML escape
 * sequences (e.g. `&#039;` = apostrophe, `&#8203;` = zero-width space).
 *
 * The check is purely syntactic: the character immediately before the `#` must
 * be `&`. This is the canonical signal — general across all codebases, with no
 * path or content-name heuristics.
 *
 * Recall guard: a standalone `#039` or `#039000` in styling (where the char
 * before `#` is a space, `:`, `'`, etc.) is NOT preceded by `&`, so it still
 * flags normally.
 */
function isHtmlNumericEntity(source: string, hitIndex: number): boolean {
  return hitIndex > 0 && source[hitIndex - 1] === "&";
}

export function detectInText(source: string, _path?: string, isCssSource = false): { match: string; index: number }[] {
  const hits: { match: string; index: number }[] = [];
  COLOR_FUNC.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = COLOR_FUNC.exec(source)) !== null) {
    if (shouldSkip(m[0])) continue;
    // Skip HTML numeric character entities (&#NNN; / &#xNN;) — the hex-like
    // portion is not a color value; it is an HTML escape sequence.
    if (isHtmlNumericEntity(source, m.index)) continue;
    // Skip any color function whose entire argument is a CSS variable reference
    // (canonical shadcn / radix-ui theming pattern — NOT hardcoded drift).
    if (COLOR_VAR_REF.test(m[0])) continue;
    // Skip color functions whose first argument is a non-literal expression
    // (identifier, member-access, `from var(...)` relative-color syntax, etc.).
    // The color value comes from a token/variable — not hardcoded drift.
    if (colorFnHasNonLiteralArg(m[0])) continue;
    // Skip values inside <code>...</code> or <pre>...</pre> on the same line
    // (display-only CSS examples — e.g. shadcn theme customizer).
    // NOTE: multi-line code blocks are not detected here; V1 needs AST context.
    if (isInsideCodeDisplay(source, m.index)) continue;
    // Skip hex/color literals that are inside a var() fallback argument.
    // e.g. var(--token, #8c959f) — the #hex is a safe CSS fallback, not drift.
    if (isInsideVarCall(source, m.index)) continue;
    // Skip color literals in comments (// /* *) and URL fragments (#anchor).
    if (isInCommentOrUrl(source, m.index)) continue;
    if (isCssCustomPropertyDeclaration(source, m.index)) continue;
    // Skip hex literals that appear inside a CSS attribute selector `[attr="#hex"]`.
    // The hex is matching an attribute VALUE — it is a selector predicate, not a
    // declared color. Only meaningful in CSS/SCSS sources (in TS/JS, `[` opens an
    // array, not a selector).
    if (isCssSource && isInsideCssAttributeSelector(source, m.index)) continue;
    // Skip color literals that are elements of a JS/TS multi-color collection
    // (array or object with ≥3 color literals) — palette/data definitions,
    // not DS drift. This suppresses syntax-highlight themes, color-preset
    // arrays, chart color series, etc. without hardcoding library names.
    // IMPORTANT: must NOT fire on CSS/SCSS sources — a gradient function or a
    // CSS rule block with multiple color stops is STYLING = drift, not a palette
    // data structure. Applying the palette guard to CSS caused a recall regression
    // (7 real-drift findings suppressed: Progress.module.css gradient, SCSS button
    // rule blocks with multiple stops, etc.).
    if (!isCssSource && isDataPaletteContext(source, m.index)) continue;
    hits.push({ match: m[0], index: m.index });
  }
  TW_ARBITRARY.lastIndex = 0;
  while ((m = TW_ARBITRARY.exec(source)) !== null) {
    if (isInsideCodeDisplay(source, m.index)) continue;
    if (isInCommentOrUrl(source, m.index)) continue;
    if (isCssCustomPropertyDeclaration(source, m.index)) continue;
    if (!isCssSource && isDataPaletteContext(source, m.index)) continue;
    hits.push({ match: m[0], index: m.index });
  }
  return hits;
}

function locationFromIndex(source: string, index: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source.charCodeAt(i) === 10) {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}

/**
 * Resolves a color literal to its four-class verdict. When `ctx.resolver` is
 * present (built once per audit from `ctx.graph`), it owns normalization on
 * both sides — this only strips the Tailwind arbitrary-value bracket first
 * (`bg-[#fff]` → `#fff`) since the resolver has no notion of Tailwind syntax.
 * A `novel` verdict on the bracket-stripped key is retried against the raw
 * (lowercased, un-stripped) value in case the resolver's own normalization
 * handles it differently — mirrors the legacy double-lookup below.
 *
 * When `ctx.resolver` is absent (MCP paths, single-file rule contexts), this
 * falls back to the pre-resolver behaviour: `ctx.graph` reverse-lookup, or
 * the flat `ctx.tokens` map, collapsed onto the two-class legacy shape
 * (`exact` when a candidate is found, `novel` otherwise — `near` and
 * `unresolved` require the resolver's normalized comparisons and are
 * unreachable here, matching the old exact-match-only semantics).
 */
function resolveColor(ctx: RuleContext, key: string, rawLower: string): Resolution {
  if (ctx.resolver) {
    const direct = ctx.resolver.resolve("colors", key);
    if (direct.class !== "novel") return direct;
    return ctx.resolver.resolve("colors", rawLower);
  }
  const legacy = ctx.graph
    ? reverseLookup(ctx.graph, "colors", key)
    : (ctx.tokens?.colors.get(key) ?? ctx.tokens?.colors.get(rawLower) ?? []);
  return legacy.length > 0
    ? { class: "exact", tokenIds: legacy }
    : { class: "novel", tokenIds: [] };
}

/** Human-readable candidate hint — unchanged wording from the pre-resolver rule. */
function candidateSuggestion(tokenIds: readonly string[]): string | undefined {
  if (tokenIds.length === 0) return undefined;
  if (tokenIds.length === 1) return `consider replacing with token ${tokenIds[0]}`;
  return `consider replacing — multiple candidate tokens: ${tokenIds.join(", ")}`;
}

interface ColorVerdict {
  severity: "warning" | "info";
  confidence: Confidence;
  suggestion?: string;
  fixGroup?: FixGroup;
}

/**
 * The class→finding mapping (copied verbatim by the other axis rules):
 *   exact      → warning / high   / fixGroup.to set (single safe auto-fix)
 *   near       → warning / medium / fixGroup.to never set (no auto-apply)
 *   novel      → info    / low    / fixGroup.to never set (no known candidate)
 *   unresolved → not a finding — caller must skip emission entirely
 */
function colorVerdict(ctx: RuleContext, raw: string): ColorVerdict | undefined {
  // Extract the hex from a Tailwind arbitrary value like bg-[#fff]. `from`/`key`
  // use this normalized value so case/Tailwind-bracket variants collapse into
  // one drift-class — this is why `fixGroup.from` can differ from the raw
  // finding `message`.
  const key = raw.replace(/^.*\[(.*)]$/, "$1").toLowerCase();
  const resolution = resolveColor(ctx, key, raw.toLowerCase());
  if (resolution.class === "unresolved") return undefined;

  if (resolution.class === "near") {
    const nearestId = resolution.tokenIds[0];
    const fixGroup = makeFixGroup("tokens/no-hardcoded-color", key, []);
    return {
      severity: "warning",
      confidence: "medium",
      ...(nearestId !== undefined && { suggestion: `probably \`${nearestId}\` — verify before replacing` }),
      ...(fixGroup !== undefined && { fixGroup }),
    };
  }

  if (resolution.class === "novel") {
    const fixGroup = makeFixGroup("tokens/no-hardcoded-color", key, []);
    return {
      severity: "info",
      confidence: "low",
      ...(fixGroup !== undefined && { fixGroup }),
    };
  }

  // exact
  const suggestion = candidateSuggestion(resolution.tokenIds);
  const fixGroup = makeFixGroup("tokens/no-hardcoded-color", key, resolution.tokenIds);
  return {
    severity: "warning",
    confidence: "high",
    ...(suggestion !== undefined && { suggestion }),
    ...(fixGroup !== undefined && { fixGroup }),
  };
}

const evaluate = async (
  ctx: RuleContext,
  files: ParsedFiles,
): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  let opportunities = 0;

  for (const f of files.ts) {
    if (isPathExcluded(f.path, ctx.excludePaths)) continue;
    // SVG art is content, not a zone — always-on guard, unconditional.
    if (isSvgIconContext(f.path)) continue;
    if (ctx.graph && !isScored(ctx.graph, f.path)) continue;
    if (!ctx.graph && (isVendoredOrResetFile(f.path) || isLowSignalValueFile(f.path) || isSchemaOrDataFile(f.path) || isColorTokenDefFile(f.path))) continue;
    const fileExt = f.path.match(/\.[^.]+$/)?.[0] ?? ".ts";
    const hits = detectInText(f.source, f.path);
    const compliantCount = countCompliantColorUses(f.source, fileExt);
    opportunities += hits.length + compliantCount;
    for (const h of hits) {
      if (isInExampleOrSchemaValuePosition(f.source, h.index)) continue;
      const verdict = colorVerdict(ctx, h.match);
      if (!verdict) continue;
      const loc = locationFromIndex(f.source, h.index);
      const lineText = f.source.split("\n")[loc.line - 1]?.trim().slice(0, 120);
      findings.push({
        ruleId: "tokens/no-hardcoded-color",
        axis: "tokens",
        severity: verdict.severity,
        confidence: verdict.confidence,
        location: { file: f.path, line: loc.line, column: loc.column },
        message: `Hardcoded color value: ${h.match}`,
        ...(verdict.suggestion !== undefined && { suggestion: verdict.suggestion }),
        ...(verdict.fixGroup !== undefined && { fixGroup: verdict.fixGroup }),
        ...(lineText !== undefined && { context: lineText }),
      });
    }
  }

  for (const c of files.css) {
    if (isPathExcluded(c.path, ctx.excludePaths)) continue;
    // SVG art is content, not a zone — always-on guard, unconditional.
    if (isSvgIconContext(c.path)) continue;
    if (ctx.graph && !isScored(ctx.graph, c.path)) continue;
    if (!ctx.graph && (isVendoredOrResetFile(c.path) || isGeneratedCssSource(c.source) || isLowSignalValueFile(c.path) || isSchemaOrDataFile(c.path) || isColorTokenDefFile(c.path))) continue;
    const fileExt = c.path.match(/\.[^.]+$/)?.[0] ?? ".css";
    const hits = detectInText(c.source, c.path, true);
    const compliantCount = countCompliantColorUses(c.source, fileExt);
    opportunities += hits.length + compliantCount;
    for (const h of hits) {
      if (isInExampleOrSchemaValuePosition(c.source, h.index)) continue;
      const verdict = colorVerdict(ctx, h.match);
      if (!verdict) continue;
      const loc = locationFromIndex(c.source, h.index);
      findings.push({
        ruleId: "tokens/no-hardcoded-color",
        axis: "tokens",
        severity: verdict.severity,
        confidence: verdict.confidence,
        location: { file: c.path, line: loc.line, column: loc.column },
        message: `Hardcoded color value: ${h.match}`,
        ...(verdict.suggestion !== undefined && { suggestion: verdict.suggestion }),
        ...(verdict.fixGroup !== undefined && { fixGroup: verdict.fixGroup }),
      });
    }
  }

  for (const b of files.cssInJs) {
    if (isPathExcluded(b.path, ctx.excludePaths)) continue;
    // SVG art is content, not a zone — always-on guard, unconditional.
    if (isSvgIconContext(b.path)) continue;
    if (ctx.graph && !isScored(ctx.graph, b.path)) continue;
    if (!ctx.graph && (isVendoredOrResetFile(b.path) || isLowSignalValueFile(b.path) || isSchemaOrDataFile(b.path) || isColorTokenDefFile(b.path))) continue;
    const fileExt = b.path.match(/\.[^.]+$/)?.[0] ?? ".tsx";
    const hits = detectInText(b.content, b.path);
    const compliantCount = countCompliantColorUses(b.content, fileExt);
    opportunities += hits.length + compliantCount;
    for (const h of hits) {
      if (isInExampleOrSchemaValuePosition(b.content, h.index)) continue;
      const verdict = colorVerdict(ctx, h.match);
      if (!verdict) continue;
      findings.push({
        ruleId: "tokens/no-hardcoded-color",
        axis: "tokens",
        severity: verdict.severity,
        confidence: verdict.confidence,
        location: { file: b.path, line: b.line, column: 1 },
        message: `Hardcoded color value in styled-components: ${h.match}`,
        ...(verdict.suggestion !== undefined && { suggestion: verdict.suggestion }),
        ...(verdict.fixGroup !== undefined && { fixGroup: verdict.fixGroup }),
      });
    }
  }

  return { findings, opportunities };
};

const TOKEN_DEF_EXPORT_NAME = /^(colors|theme|tokens|palette|brand)$/i;
const HEX_LITERAL = /^#[0-9a-fA-F]{3,8}$/;

/**
 * Uses ts-morph to determine whether `filePath` is the canonical design-token
 * definition file (e.g. exports `theme = { primary: "#ff0000", ... }`).
 *
 * Heuristic: the file's exported declarations include at least one name in
 * `/^(colors|theme|tokens|palette|brand)$/i` whose initializer is an object
 * literal with >= 3 string-valued properties, where most string values look
 * like hex color literals.
 *
 * Returns `false` on any error (missing file, parse failure, etc.) so the
 * check never introduces false negatives — at worst confidence stays "high".
 */
function isTokenDefinitionFile(filePath: string, repoRoot: string): boolean {
  if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(filePath)) return false;
  const absolute = isAbsolute(filePath) ? filePath : join(repoRoot, filePath);
  try {
    const tsm = getTsMorphProject(repoRoot);
    const sf = tsm.getSourceFile(absolute);
    if (!sf) return false;

    const exported = sf.getExportedDeclarations();
    for (const [name, decls] of exported) {
      if (!TOKEN_DEF_EXPORT_NAME.test(name)) continue;
      for (const decl of decls) {
        if (looksLikeTokenObjectLiteral(decl)) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Returns true if `decl` is (or contains) an object literal with >= 3
 * string-valued properties of which >= half are hex-color literals.
 */
function looksLikeTokenObjectLiteral(decl: unknown): boolean {
  const d = decl as { getInitializer?: () => unknown; getProperties?: () => unknown[] };
  // Variable declarations carry an initializer; object-literal nodes carry
  // properties directly.
  let obj: { getProperties?: () => unknown[] } | undefined;
  if (typeof d.getInitializer === "function") {
    const init = d.getInitializer() as { getProperties?: () => unknown[] } | undefined;
    if (init && typeof init.getProperties === "function") {
      obj = init;
    }
  } else if (typeof d.getProperties === "function") {
    obj = d as { getProperties?: () => unknown[] };
  }
  if (!obj?.getProperties) return false;

  const props = obj.getProperties();
  if (props.length < 3) return false;

  let stringValueCount = 0;
  let hexishCount = 0;
  for (const p of props) {
    const prop = p as {
      getInitializer?: () => { getLiteralText?: () => string; getText?: () => string } | undefined;
    };
    if (typeof prop.getInitializer !== "function") continue;
    const init = prop.getInitializer();
    if (!init) continue;
    const raw = typeof init.getLiteralText === "function"
      ? init.getLiteralText()
      : typeof init.getText === "function"
        ? init.getText().replace(/^['"`]|['"`]$/g, "")
        : undefined;
    if (typeof raw !== "string") continue;
    stringValueCount++;
    if (HEX_LITERAL.test(raw.trim())) hexishCount++;
  }
  if (stringValueCount < 3) return false;
  // Require at least half the string values to look like hex — guards against
  // false positives on unrelated string maps named "theme" / "brand".
  return hexishCount * 2 >= stringValueCount;
}

const classifyConfidence: NonNullable<Rule["classifyConfidence"]> = (
  finding: Finding,
  ctx: ClassifyContext,
): Confidence => {
  // AST role: functional roles are not drift — grade them low.
  // Only demote for the 3 genuine functional roles; unknown/styling/parse-failure
  // keep existing logic (recall guardrail — never hide real drift).
  if (ctx.repoRoot) {
    const role = classifyColorRole({
      repoRoot: ctx.repoRoot,
      file: finding.location.file,
      line: finding.location.line,
      column: finding.location.column ?? 1,
    });
    if (role === "canvas" || role === "default-prop" || role === "svg-art") {
      return "low";
    }
  }

  // Extract color value from message — format: "Hardcoded color value: <value>"
  const colorMatch = finding.message.match(/:\s*(.+)$/);
  const raw = colorMatch?.[1]?.trim() ?? "";

  // Alpha channel means uncertain replacement — the token may not carry opacity
  const hasAlpha = /rgba?\([^)]+,\s*[\d.]+\)|#[0-9a-fA-F]{8}\b/.test(raw);
  if (hasAlpha) return "medium";

  if (!raw) return "low";

  const key = raw.toLowerCase();
  const candidates = ctx.tokens.colors.get(key) ?? ctx.tokens.colors.get(key.replace(/^.*\[(.*)\]$/, "$1"));
  if (!candidates || candidates.length === 0) return "low";

  // Token-definition files (where hex literals are EXPECTED) get medium
  // confidence so they are not auto-fixed by default. Requires ctx.repoRoot
  // to be set; if absent, fall through to "high".
  if (ctx.repoRoot && isTokenDefinitionFile(finding.location.file, ctx.repoRoot)) {
    return "medium";
  }

  return "high";
};

const applyCodemod: NonNullable<Rule["applyCodemod"]> = (
  finding: Finding,
  ctx: CodemodContext,
): CodemodResult => {
  const ruleCtx: RuleContext = {
    repoRoot: "",
    tokens: ctx.tokens,
    componentsModule: ctx.config.designSystem?.componentsModule ?? null,
    componentInventory: [],
    storyIndex: null,
    excludePaths: [],
  };
  const oldResult = fixHardcodedColor({
    source: ctx.fileContent,
    path: finding.location.file,
    finding,
    ctx: ruleCtx,
  });
  return adaptOldCodemodResult(oldResult);
};

export const rule = createLyseRule({
  meta: {
    axis: "tokens",
    lyseRuleId: "tokens/no-hardcoded-color",
    defaultSeverity: "warning",
    shortDescription: "Disallow hardcoded color values",
    fullDescription:
      "Hardcoded color values (#hex, rgb(), hsl(), oklch(), Tailwind arbitrary `bg-[#fff]`) bypass the design system. They survive token changes silently (a brand refresh becomes a manual hunt) and break dark-mode propagation through CSS variables.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/tokens-no-hardcoded-color.md",
    rationale: `Why it matters

Hardcoded colors are the #1 signal that an AI agent ignored the design contract. They silently fork the design system: each #2563eb that should be color.action.primary is a token-rename bomb waiting to detonate.

When the rule fires, the suggestion includes the matching token from the project's TokenMap when the reverse-lookup yields exactly one candidate. When multiple tokens map to the same color value (common with primitive vs semantic token layers), all candidates are listed — the agent or human picks.`,
    examples: [
      { good: '<div className="bg-action-primary text-on-action">', bad: '<div style={{ background: "#2563eb", color: "#fff" }}>' },
      { good: '<div className="bg-action-primary">',                bad: '<div className="bg-[#2563eb]">' },
      { good: "color: var(--color-action-primary);",                bad: "color: hsl(214, 86%, 53%);" },
    ],
    allowlist: ["currentColor", "transparent", "inherit", "initial", "unset", "none", "auto"],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
  classifyConfidence,
  applyCodemod,
  singleFileCapable: true,
});
