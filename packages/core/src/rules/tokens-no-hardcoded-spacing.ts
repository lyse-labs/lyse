import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding, ClassifyContext, Confidence, CodemodContext, CodemodResult, FixGroup } from "../types.js";
import { isInsideSkippedJsxAttr, isInsideCodeDisplay, isCssCustomPropertyDeclaration, isLowSignalValueFile, isSchemaOrDataFile, isInExampleOrSchemaValuePosition, isNotSpacingPropertyContext, isInCommentOrUrl, isInVarFallback } from "./_skip-context.js";
import { isPathExcluded } from "./_exclude.js";
import { fixHardcodedSpacing } from "../codemods/tokens-spacing.js";
import { adaptOldCodemodResult } from "./_codemod-adapter.js";
import { createLyseRule } from "./_rule-module.js";
import { makeFixGroup } from "./_fix-group.js";
import { isScored, onScale, reverseLookup } from "../graph/query.js";
import type { ResolveClass } from "../graph/resolve/types.js";
import { numericValue, DEFAULT_SPACING_SCALE } from "../graph/resolve/scales.js";

const PX_REM_EM = /\b(\d+(\.\d+)?)(px|rem|em)\b/g;
// Only `0` and `100` are unconditionally allowed. `1` (i.e. 1px) is only
// allowed in border-width context — NOT in padding/margin/gap (real drift).
const ALLOW_PX_VALUES = new Set(["0", "100"]);
const ALLOW_KEYWORDS = new Set(["auto", "100%", "100vh", "100vw", "0"]);

// ---------------------------------------------------------------------------
// Tailwind spacing scale — standard Tailwind v3/v4 spacing values.
// Static list; no eval risk.
// ---------------------------------------------------------------------------
// Standard numeric scale (including 0.5 / 1.5 etc. represented as "0\.5")
const TW_SPACING_SCALE_NUMS = [
  "0", "0\\.5", "1", "1\\.5", "2", "2\\.5", "3", "3\\.5",
  "4", "5", "6", "7", "8", "9", "10", "11", "12", "14",
  "16", "20", "24", "28", "32", "36", "40", "44", "48",
  "52", "56", "60", "64", "72", "80", "96",
];
const TW_SPACING_KEYWORDS = ["px", "full", "screen", "auto", "svh", "dvh", "lvh"];
const TW_SPACING_VALUES = `(?:${TW_SPACING_SCALE_NUMS.join("|")}|${TW_SPACING_KEYWORDS.join("|")})`;

// Spacing utility prefixes:
//   p, px, py, pt, pr, pb, pl  — padding
//   m, mx, my, mt, mr, mb, ml  — margin
//   gap, gap-x, gap-y
//   space-x, space-y
//   w, h, min-w, min-h, max-w, max-h
//   inset, inset-x, inset-y, top, right, bottom, left
const TW_SPACING_PREFIXES =
  "p[xytblr]?|m[xytblr]?|gap(?:-[xy])?|space-[xy]|w|h|min-[wh]|max-[wh]|inset(?:-[xy])?|top|right|bottom|left|size";

const TW_SPACING_UTILITY_RE = new RegExp(
  `\\b(?:${TW_SPACING_PREFIXES})-${TW_SPACING_VALUES}\\b`,
  "g",
);

/**
 * Counts compliant Tailwind spacing utility usages in TSX/JSX/TS/JS files.
 * p-4, m-2, gap-8, space-x-4, w-full, h-screen, etc.
 * These are on-scale token usages encoded as class names.
 */
export function countCompliantSpacingUses(source: string, fileExt: string): number {
  if (fileExt !== ".ts" && fileExt !== ".tsx" && fileExt !== ".jsx" && fileExt !== ".js") {
    return 0;
  }
  TW_SPACING_UTILITY_RE.lastIndex = 0;
  const matches = source.match(TW_SPACING_UTILITY_RE);
  return matches ? matches.length : 0;
}

function locationFromIndex(source: string, index: number): { line: number; column: number } {
  let line = 1, column = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source.charCodeAt(i) === 10) { line++; column = 1; } else { column++; }
  }
  return { line, column };
}

/** The pre-resolver exact-match lookup, kept verbatim for legacy contexts. */
function legacyCandidates(ctx: RuleContext, numKey: string, raw: string): string[] {
  if (ctx.graph) return reverseLookup(ctx.graph, "spacing", numKey);
  if (!ctx.tokens) return [];
  return ctx.tokens.spacing.get(raw) ?? ctx.tokens.spacing.get(numKey) ?? [];
}

/** The pre-resolver on-scale check, kept verbatim for legacy contexts. */
function legacyOnScale(ctx: RuleContext, value: number): boolean {
  if (ctx.graph) return onScale(ctx.graph, "spacing", String(value));
  if (!ctx.tokens) return false;
  return ctx.tokens.spacing.has(String(value));
}

/** Human-readable candidate hint — unchanged wording from the pre-resolver rule. */
function candidateSuggestion(tokenIds: readonly string[]): string | undefined {
  if (tokenIds.length === 0) return undefined;
  if (tokenIds.length === 1) return `consider token ${tokenIds[0]}`;
  return `candidate tokens: ${tokenIds.join(", ")}`;
}

interface SpacingVerdict {
  severity: "warning" | "info";
  /**
   * Left unset on the legacy (no-resolver) path so `populateConfidence`'s
   * `classifyConfidence` hook still governs it, exactly as before the migration.
   */
  confidence?: Confidence;
  suggestion?: string;
  fixGroup?: FixGroup;
}

/**
 * The class→finding mapping for THIS axis. Unlike the colour rule, `exact`
 * means the value IS on the repo's own scale — compliant, not drift — so it
 * is handled as an early skip in `spacingVerdict` rather than appearing here.
 * `unresolved` is also a skip: the resolver could not judge this value, and
 * (unlike colours) that abstention is legitimate here, so it stays silent.
 */
const VERDICT_BY_CLASS: Record<
  Extract<ResolveClass, "near" | "novel">,
  { severity: "warning" | "info"; confidence: Confidence }
> = {
  near: { severity: "warning", confidence: "medium" },
  novel: { severity: "info", confidence: "low" },
};

/**
 * The resolver can only ever return `exact`/`near` by anchoring on a real
 * token id (see `classifyNumeric` in graph/resolve/index.ts — its distance
 * scan iterates the axis's actual tokens, and `deriveScale`'s Tailwind
 * fallback only feeds the `near` distance metric, gated on a token existing
 * to attach). A repo with ZERO spacing tokens therefore gets `novel` for
 * EVERY literal, including perfectly ordinary Tailwind-shaped values like
 * `16px` — there is no token id for the resolver to report, on-scale or not.
 * This mirrors `deriveScale`'s own fallback intent as a plain membership
 * check so a project that simply hasn't authored a spacing scale isn't
 * flooded with false positives on default-Tailwind values.
 */
function hasSpacingTokens(ctx: RuleContext): boolean {
  return ctx.graph?.tokens.some((t) => t.axis === "spacing") ?? false;
}

function isOnDefaultSpacingScale(raw: string): boolean {
  const n = numericValue(raw);
  return n !== null && DEFAULT_SPACING_SCALE.includes(n);
}

/**
 * Builds the finding fields for one detected spacing literal, or `undefined`
 * when nothing should be emitted.
 *
 * Legacy path (no `ctx.resolver` — MCP `audit_file`, single-file rule
 * contexts, codemod contexts): byte-identical to the pre-resolver rule —
 * always `warning`, no emit-time `confidence`, suggestion + fixGroup from the
 * flat exact-match lookup. No Tailwind-default fallback here either — that
 * matches the pre-resolver rule, which never had one.
 *
 * Resolver path: `raw` (the full match, WITH its px/rem/em unit) is the
 * resolve key — the resolver's own `numericValue` normalizes rem/em to px at
 * a 16px root, so a literal written in rem compares correctly against a
 * scale derived from px tokens (and vice versa). `exact` means on-scale →
 * skip (this rule's inverse of the colour rule's `exact`, see the module
 * docstring above `VERDICT_BY_CLASS`). `near`/`novel` get a fixGroup with NO
 * candidates — an auto-fix is only ever safe for an `exact` match, and those
 * are never emitted as findings on this axis.
 */
function spacingVerdict(ctx: RuleContext, raw: string, num: string): SpacingVerdict | undefined {
  if (!ctx.resolver) {
    if (legacyOnScale(ctx, parseFloat(num))) return undefined;
    const candidates = legacyCandidates(ctx, num, raw);
    const suggestion = candidateSuggestion(candidates);
    const fixGroup = makeFixGroup("tokens/no-hardcoded-spacing", raw, candidates);
    return {
      severity: "warning",
      ...(suggestion !== undefined && { suggestion }),
      ...(fixGroup !== undefined && { fixGroup }),
    };
  }

  const resolution = ctx.resolver.resolve("spacing", raw);
  if (resolution.class === "exact" || resolution.class === "unresolved") return undefined;
  if (resolution.class === "novel" && !hasSpacingTokens(ctx) && isOnDefaultSpacingScale(raw)) return undefined;

  const { severity, confidence } = VERDICT_BY_CLASS[resolution.class];
  const fixGroup = makeFixGroup("tokens/no-hardcoded-spacing", raw, []);
  return {
    severity,
    confidence,
    ...(fixGroup !== undefined && { fixGroup }),
  };
}

const evaluate = async (
  ctx: RuleContext,
  files: ParsedFiles,
): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  let opportunities = 0;

  const scan = (path: string, source: string, blockLine = 0) => {
    PX_REM_EM.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PX_REM_EM.exec(source)) !== null) {
      const raw = m[0];
      const num = m[1]!;
      const unit = m[3]!;
      opportunities++;
      // Zero is zero regardless of unit (0, 0px, 0rem, 0em, 0.0rem) — never drift.
      if (parseFloat(num) === 0) continue;
      if (unit === "px" && ALLOW_PX_VALUES.has(num)) continue;
      const verdict = spacingVerdict(ctx, raw, num);
      if (!verdict) continue;
      // Skip px/rem/em values inside JSX attributes that carry media-query
      // breakpoints (sizes, srcSet, media). These are responsive image
      // markup — not spacing tokens. NOTE: sizes={"..."} (JSX expression
      // form) is NOT handled here; requires AST traversal — deferred to V1.
      if (isInsideSkippedJsxAttr(source, m.index)) continue;
      // Skip values inside same-line <code>...</code> or <pre>...</pre>
      // blocks (display-only examples). Multi-line blocks are V1 work.
      if (isInsideCodeDisplay(source, m.index)) continue;
      if (isInCommentOrUrl(source, m.index)) continue;
      if (isCssCustomPropertyDeclaration(source, m.index)) continue;
      // A literal in a `var(--token, <fallback>)` fallback is tokenized usage,
      // not drift — the var() reference is the real value.
      if (isInVarFallback(source, m.index)) continue;
      if (isInExampleOrSchemaValuePosition(source, m.index)) continue;
      // Property-awareness: skip values not in a spacing CSS property or
      // spacing Tailwind arbitrary-value prefix. This suppresses font-size,
      // line-height, border-radius, width, height, transform, @media, etc.
      if (isNotSpacingPropertyContext(source, m.index)) continue;
      const loc = blockLine > 0 ? { line: blockLine, column: 1 } : locationFromIndex(source, m.index);
      findings.push({
        ruleId: "tokens/no-hardcoded-spacing",
        axis: "tokens",
        severity: verdict.severity,
        ...(verdict.confidence !== undefined && { confidence: verdict.confidence }),
        location: { file: path, line: loc.line, column: loc.column },
        message: `Off-scale spacing: ${raw}`,
        ...(verdict.suggestion !== undefined && { suggestion: verdict.suggestion }),
        ...(verdict.fixGroup !== undefined && { fixGroup: verdict.fixGroup }),
      });
    }
  };

  for (const f of files.ts) {
    if (isPathExcluded(f.path, ctx.excludePaths)) continue;
    if (ctx.graph && !isScored(ctx.graph, f.path)) continue;
    if (!ctx.graph && (isLowSignalValueFile(f.path) || isSchemaOrDataFile(f.path))) continue;
    scan(f.path, f.source);
    // Also count Tailwind spacing utility classes as compliant opportunities
    const fileExt = f.path.match(/\.[^.]+$/)?.[0] ?? ".ts";
    opportunities += countCompliantSpacingUses(f.source, fileExt);
  }
  for (const c of files.css) {
    if (isPathExcluded(c.path, ctx.excludePaths)) continue;
    if (ctx.graph && !isScored(ctx.graph, c.path)) continue;
    if (!ctx.graph && (isLowSignalValueFile(c.path) || isSchemaOrDataFile(c.path))) continue;
    scan(c.path, c.source);
  }
  for (const b of files.cssInJs) {
    if (isPathExcluded(b.path, ctx.excludePaths)) continue;
    if (ctx.graph && !isScored(ctx.graph, b.path)) continue;
    if (!ctx.graph && (isLowSignalValueFile(b.path) || isSchemaOrDataFile(b.path))) continue;
    scan(b.path, b.content, b.line);
  }

  return { findings, opportunities };
};

const classifyConfidence: NonNullable<Rule["classifyConfidence"]> = (
  finding: Finding,
  ctx: ClassifyContext,
): Confidence => {
  // Extract spacing value from message — format: "Off-scale spacing: 16px"
  const rawMatch = finding.message.match(/:\s*(.+)$/);
  const raw = rawMatch?.[1]?.trim() ?? "";

  // Negative spacing is unusual — may be intentional, flag for human review
  const isNegative = /^-\d/.test(raw) || (finding.context !== undefined && /-\d+px/.test(finding.context));
  if (isNegative) return "medium";

  const numMatch = raw.match(/^(\d+(\.\d+)?)(px|rem|em)$/);
  if (!numMatch) return "low";

  const numericValue = numMatch[1]!;
  const candidates = ctx.tokens.spacing.get(numericValue);
  if (!candidates || candidates.length === 0) return "low";

  // Multiple matches require human choice
  if (candidates.length > 1) return "medium";

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
  const oldResult = fixHardcodedSpacing({
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
    lyseRuleId: "tokens/no-hardcoded-spacing",
    defaultSeverity: "warning",
    shortDescription: "Disallow off-scale spacing values",
    fullDescription:
      "Padding, margin, gap, and similar properties using raw px/rem/em values outside the documented spacing scale (Tailwind config, DTCG dimension tokens, or CSS variables) produce inconsistent rhythm and break theming.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/tokens-no-hardcoded-spacing.md",
    rationale: `Why it matters

The spacing scale encodes the rhythm of the product. A one-off \`padding: 7px\` survives every design-pass and slowly desynchronizes layouts. When the rule fires, the suggestion includes the matching scale step when the value maps to exactly one token.

The allowlist accommodates 1px borders (\`border: 1px solid\`), zero, and full-viewport keywords — these are not design-system tokens but pragmatic primitives.`,
    examples: [
      { good: '<div className="p-2">', bad: '<div style={{ padding: "7px" }}>' },
      { good: "gap: var(--spacing-4);", bad: "gap: 13px;" },
    ],
    allowlist: ["0", "auto", "100%", "100vh", "100vw"],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
  classifyConfidence,
  applyCodemod,
  singleFileCapable: true,
});

// silence "unused" — keyword detection is for future expansion.
void ALLOW_KEYWORDS;
