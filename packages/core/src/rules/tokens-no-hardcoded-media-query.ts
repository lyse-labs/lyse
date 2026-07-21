import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding, FixGroup, Confidence } from "../types.js";
import { isInCommentOrUrl, isLowSignalValueFile, isSchemaOrDataFile } from "./_skip-context.js";
import { isPathExcluded } from "./_exclude.js";
import { createLyseRule } from "./_rule-module.js";
import { makeFixGroup } from "./_fix-group.js";
import { isScored, onScale, reverseLookup } from "../graph/query.js";
import type { ResolveClass } from "../graph/resolve/types.js";

const RULE_ID = "tokens/no-hardcoded-media-query";
const MAX_FILE_BYTES = 1_000_000;

const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;
const README_CANDIDATES = ["README.md", "README", "readme.md", "README.mdx"];

// `@media` (and `@container`) preludes — everything from the at-rule up to the
// opening brace. Breakpoint literals live only here; a `max-width:` in a normal
// rule body is a sizing property (the hardcoded-spacing rule's territory), not a
// media-query breakpoint, so we never scan rule bodies.
const MEDIA_PRELUDE_RE = /@media\b[^{;]*\{/gi;
// Colon form: `(min-width: 768px)`, `(max-height: 40rem)`, `(width: 600px)`.
const FEATURE_COLON_RE = /\b(?:min-|max-)?(?:width|height)\s*:\s*(\d+(?:\.\d+)?)(px|rem|em)\b/gi;
// Range form: `(width >= 600px)` and `(600px <= width)`.
const FEATURE_RANGE_RE =
  /(?:\b(?:width|height)\s*[<>]=?\s*(\d+(?:\.\d+)?)(px|rem|em)\b)|(?:\b(\d+(?:\.\d+)?)(px|rem|em)\s*[<>]=?\s*(?:width|height)\b)/gi;

function readFileIfSmall(absPath: string): string | null {
  try {
    const stat = statSync(absPath);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
    return readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
}

function isAllowlisted(repoRoot: string): boolean {
  for (const candidate of README_CANDIDATES) {
    const abs = join(repoRoot, candidate);
    if (!existsSync(abs)) continue;
    const content = readFileIfSmall(abs);
    if (content !== null && content.includes(DISABLE_DIRECTIVE)) return true;
  }
  return false;
}

function locationFromIndex(source: string, index: number): { line: number; column: number } {
  let line = 1, column = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source.charCodeAt(i) === 10) { line++; column = 1; } else { column++; }
  }
  return { line, column };
}

function isOnScale(ctx: RuleContext, raw: string): boolean {
  if (ctx.graph) return onScale(ctx.graph, "breakpoints", raw);
  const scale = ctx.tokens?.breakpoints;
  if (!scale || scale.size === 0) return false;
  return scale.has(raw);
}

function mediaQueryFixGroup(ctx: RuleContext, raw: string): FixGroup | undefined {
  if (ctx.graph) return makeFixGroup(RULE_ID, raw, reverseLookup(ctx.graph, "breakpoints", raw));
  if (!ctx.tokens) return undefined;
  const candidates = ctx.tokens.breakpoints.get(raw);
  return makeFixGroup(RULE_ID, raw, candidates);
}

/**
 * Fixed remediation hint, emitted on BOTH paths — see the identical constant in
 * `tokens-no-hardcoded-shadow.ts`. On the `near` sub-path the resolver's own
 * candidate token is strictly more specific and supersedes it; a `novel` has no
 * candidate to name, so it keeps the hint the legacy path always emitted rather
 * than saying nothing at all. `lyse handoff` reads `suggestion` verbatim.
 */
const STATIC_SUGGESTION =
  "reference a tokenized breakpoint scale (SCSS `$breakpoint-*`, a custom property, or a JS `breakpoints` map) instead of a raw literal";

interface MediaQueryVerdict {
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
 * The class→finding mapping for THIS axis. `exact` means the value IS on the
 * repo's own breakpoint scale — compliant, not drift — so it is handled as
 * an early skip below rather than appearing here. `unresolved` is also a
 * skip: the resolver could not judge this value, and (unlike colours) that
 * abstention is legitimate here, so it stays silent. See
 * tokens-no-hardcoded-spacing.ts's identical mapping for the full rationale.
 */
const VERDICT_BY_CLASS: Record<
  Extract<ResolveClass, "near" | "novel">,
  { severity: "warning" | "info"; confidence: Confidence }
> = {
  near: { severity: "warning", confidence: "medium" },
  novel: { severity: "info", confidence: "low" },
};

/**
 * Builds the finding fields for one detected breakpoint literal, or
 * `undefined` when nothing should be emitted. Mirrors
 * tokens-no-hardcoded-spacing.ts's `spacingVerdict` — see that file's
 * docstring for the full rationale (legacy vs. resolver path, why `near`
 * names a candidate token while `novel` falls back to the static hint, why
 * `exact`/`unresolved` skip).
 */
function mediaQueryVerdict(ctx: RuleContext, raw: string): MediaQueryVerdict | undefined {
  if (!ctx.resolver) {
    if (isOnScale(ctx, raw)) return undefined;
    const fixGroup = mediaQueryFixGroup(ctx, raw);
    return {
      severity: "warning",
      suggestion: STATIC_SUGGESTION,
      ...(fixGroup !== undefined && { fixGroup }),
    };
  }

  const resolution = ctx.resolver.resolve("breakpoints", raw);
  if (resolution.class === "exact" || resolution.class === "unresolved") return undefined;

  const { severity, confidence } = VERDICT_BY_CLASS[resolution.class];
  const fixGroup = makeFixGroup(RULE_ID, raw, []);
  const suggestion =
    resolution.class === "near" && resolution.tokenIds[0] !== undefined
      ? `probably \`${resolution.tokenIds[0]}\` — verify before replacing`
      : STATIC_SUGGESTION;
  return {
    severity,
    confidence,
    suggestion,
    ...(fixGroup !== undefined && { fixGroup }),
  };
}

/**
 * Collects the absolute source offsets of every breakpoint literal that lives
 * inside a `@media` prelude. A literal value of `0` (e.g. `min-width: 0`) is a
 * reset, not a breakpoint, and is excluded.
 */
function collectBreakpointLiterals(source: string): { index: number; raw: string }[] {
  const hits: { index: number; raw: string }[] = [];
  MEDIA_PRELUDE_RE.lastIndex = 0;
  let prelude: RegExpExecArray | null;
  while ((prelude = MEDIA_PRELUDE_RE.exec(source)) !== null) {
    const text = prelude[0];
    const base = prelude.index;
    for (const re of [FEATURE_COLON_RE, FEATURE_RANGE_RE]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const num = m[1] ?? m[3];
        const unit = m[2] ?? m[4];
        if (num === undefined || unit === undefined) continue;
        if (parseFloat(num) === 0) continue;
        hits.push({ index: base + m.index, raw: `${num}${unit}` });
      }
    }
  }
  return hits;
}

const evaluate = async (ctx: RuleContext, files: ParsedFiles): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (ctx.repoRoot && isAllowlisted(ctx.repoRoot)) return { findings, opportunities: 0 };

  let opportunities = 0;

  const scan = (path: string, source: string, blockLine = 0) => {
    for (const { index, raw } of collectBreakpointLiterals(source)) {
      // A commented-out media query is not a real breakpoint declaration —
      // it counts neither as an opportunity nor as drift.
      if (isInCommentOrUrl(source, index)) continue;
      opportunities++;
      const verdict = mediaQueryVerdict(ctx, raw);
      if (!verdict) continue;
      const loc = blockLine > 0 ? { line: blockLine, column: 1 } : locationFromIndex(source, index);
      findings.push({
        ruleId: RULE_ID,
        axis: "tokens",
        severity: verdict.severity,
        ...(verdict.confidence !== undefined && { confidence: verdict.confidence }),
        location: { file: path, line: loc.line, column: loc.column },
        message: `Hardcoded media-query breakpoint: ${raw}`,
        ...(verdict.suggestion !== undefined && { suggestion: verdict.suggestion }),
        ...(verdict.fixGroup !== undefined && { fixGroup: verdict.fixGroup }),
      });
    }
  };

  for (const f of files.css) {
    if (f.skipped) continue;
    if (isPathExcluded(f.path, ctx.excludePaths)) continue;
    if (ctx.graph && !isScored(ctx.graph, f.path)) continue;
    if (!ctx.graph && (isLowSignalValueFile(f.path) || isSchemaOrDataFile(f.path))) continue;
    scan(f.path, f.source);
  }
  for (const b of files.cssInJs) {
    if (isPathExcluded(b.path, ctx.excludePaths)) continue;
    if (ctx.graph && !isScored(ctx.graph, b.path)) continue;
    if (!ctx.graph && (isLowSignalValueFile(b.path) || isSchemaOrDataFile(b.path))) continue;
    scan(b.path, b.content, b.line);
  }

  return { findings, opportunities };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "tokens",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Disallow hardcoded media-query breakpoint values",
    fullDescription:
      "Flags raw px/rem/em literals used as breakpoint values inside `@media` width/height features (colon and range syntax) when they are not on the tokenized breakpoint scale. Tokenized breakpoints — SCSS `$breakpoint-*` interpolation, custom properties, or a JS `breakpoints` map — produce no raw literal and never fire. This is the per-occurrence complement to `tokens/responsive-breakpoints`, which checks at repo level whether a breakpoint scale exists at all. Sizing properties (`max-width:`) in normal rule bodies are not media-query breakpoints and are not scanned.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/tokens-no-hardcoded-media-query.md",
    rationale: `Why it matters

A design system's breakpoints are a shared vocabulary. When media queries hardcode \`768px\` here and \`760px\` there, layouts break at inconsistent widths and there is no single source of truth for the responsive grid. Referencing a tokenized breakpoint scale keeps every component snapping to the same widths.

A literal that matches a defined breakpoint token value is treated as on-scale (consistent), and \`min-width: 0\` resets are ignored.`,
    examples: [
      {
        good: "@media (min-width: $breakpoint-md) { .grid { display: grid; } }",
        bad: "@media (min-width: 768px) { .grid { display: grid; } }",
      },
    ],
    allowlist: [
      "`min-width: 0` and other zero resets",
      "values that match a defined breakpoint token (on-scale)",
      "repos containing `lyse-disable tokens/no-hardcoded-media-query` in a README — rule is N/A",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  collectBreakpointLiterals,
  isAllowlisted,
  isOnScale,
  DISABLE_DIRECTIVE,
};
