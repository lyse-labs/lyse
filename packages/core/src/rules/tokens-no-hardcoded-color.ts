import { isAbsolute, join } from "node:path";
import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding, ClassifyContext, Confidence, CodemodContext, CodemodResult } from "../types.js";
import { isInsideCodeDisplay, isCssCustomPropertyDeclaration, isLowSignalValueFile, isSchemaOrDataFile, isInExampleOrSchemaValuePosition, isColorTokenDefFile, isInCommentOrUrl } from "./_skip-context.js";
import { isPathExcluded } from "./_exclude.js";
import { fixHardcodedColor } from "../codemods/tokens-color.js";
import { adaptOldCodemodResult } from "./_codemod-adapter.js";
import { createLyseRule } from "./_rule-module.js";
import { getTsMorphProject } from "../parsers/ts-morph-project.js";

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

export function detectInText(source: string, _path?: string): { match: string; index: number }[] {
  const hits: { match: string; index: number }[] = [];
  COLOR_FUNC.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = COLOR_FUNC.exec(source)) !== null) {
    if (shouldSkip(m[0])) continue;
    // Skip any color function whose entire argument is a CSS variable reference
    // (canonical shadcn / radix-ui theming pattern — NOT hardcoded drift).
    if (COLOR_VAR_REF.test(m[0])) continue;
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
    hits.push({ match: m[0], index: m.index });
  }
  TW_ARBITRARY.lastIndex = 0;
  while ((m = TW_ARBITRARY.exec(source)) !== null) {
    if (isInsideCodeDisplay(source, m.index)) continue;
    if (isInCommentOrUrl(source, m.index)) continue;
    if (isCssCustomPropertyDeclaration(source, m.index)) continue;
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

function suggestToken(ctx: RuleContext, raw: string): string | undefined {
  if (!ctx.tokens) return undefined;
  // Extract the hex from a Tailwind arbitrary value like bg-[#fff]
  const key = raw.replace(/^.*\[(.*)\]$/, "$1").toLowerCase();
  const tokens = ctx.tokens.colors.get(key) ?? ctx.tokens.colors.get(raw.toLowerCase());
  if (!tokens || tokens.length === 0) return undefined;
  if (tokens.length === 1) return `consider replacing with token ${tokens[0]}`;
  return `consider replacing — multiple candidate tokens: ${tokens.join(", ")}`;
}

const evaluate = async (
  ctx: RuleContext,
  files: ParsedFiles,
): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  let opportunities = 0;

  for (const f of files.ts) {
    if (isPathExcluded(f.path, ctx.excludePaths)) continue;
    if (isLowSignalValueFile(f.path)) continue;
    if (isSchemaOrDataFile(f.path)) continue;
    if (isColorTokenDefFile(f.path)) continue;
    const fileExt = f.path.match(/\.[^.]+$/)?.[0] ?? ".ts";
    const hits = detectInText(f.source, f.path);
    const compliantCount = countCompliantColorUses(f.source, fileExt);
    opportunities += hits.length + compliantCount;
    for (const h of hits) {
      if (isInExampleOrSchemaValuePosition(f.source, h.index)) continue;
      const loc = locationFromIndex(f.source, h.index);
      const suggestion = suggestToken(ctx, h.match);
      const lineText = f.source.split("\n")[loc.line - 1]?.trim().slice(0, 120);
      findings.push({
        ruleId: "tokens/no-hardcoded-color",
        axis: "tokens",
        severity: "warning",
        location: { file: f.path, line: loc.line, column: loc.column },
        message: `Hardcoded color value: ${h.match}`,
        ...(suggestion !== undefined && { suggestion }),
        ...(lineText !== undefined && { context: lineText }),
      });
    }
  }

  for (const c of files.css) {
    if (isPathExcluded(c.path, ctx.excludePaths)) continue;
    if (isLowSignalValueFile(c.path)) continue;
    if (isSchemaOrDataFile(c.path)) continue;
    if (isColorTokenDefFile(c.path)) continue;
    const fileExt = c.path.match(/\.[^.]+$/)?.[0] ?? ".css";
    const hits = detectInText(c.source, c.path);
    const compliantCount = countCompliantColorUses(c.source, fileExt);
    opportunities += hits.length + compliantCount;
    for (const h of hits) {
      if (isInExampleOrSchemaValuePosition(c.source, h.index)) continue;
      const loc = locationFromIndex(c.source, h.index);
      const suggestion = suggestToken(ctx, h.match);
      findings.push({
        ruleId: "tokens/no-hardcoded-color",
        axis: "tokens",
        severity: "warning",
        location: { file: c.path, line: loc.line, column: loc.column },
        message: `Hardcoded color value: ${h.match}`,
        ...(suggestion !== undefined && { suggestion }),
      });
    }
  }

  for (const b of files.cssInJs) {
    if (isPathExcluded(b.path, ctx.excludePaths)) continue;
    if (isLowSignalValueFile(b.path)) continue;
    if (isSchemaOrDataFile(b.path)) continue;
    if (isColorTokenDefFile(b.path)) continue;
    const fileExt = b.path.match(/\.[^.]+$/)?.[0] ?? ".tsx";
    const hits = detectInText(b.content, b.path);
    const compliantCount = countCompliantColorUses(b.content, fileExt);
    opportunities += hits.length + compliantCount;
    for (const h of hits) {
      if (isInExampleOrSchemaValuePosition(b.content, h.index)) continue;
      const suggestion = suggestToken(ctx, h.match);
      findings.push({
        ruleId: "tokens/no-hardcoded-color",
        axis: "tokens",
        severity: "warning",
        location: { file: b.path, line: b.line, column: 1 },
        message: `Hardcoded color value in styled-components: ${h.match}`,
        ...(suggestion !== undefined && { suggestion }),
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
