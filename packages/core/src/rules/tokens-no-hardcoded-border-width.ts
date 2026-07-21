import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding, FixGroup, Confidence } from "../types.js";
import { createLyseRule } from "./_rule-module.js";
import { isInCommentOrUrl, isCssCustomPropertyDeclaration } from "./_skip-context.js";
import { makeFixGroup } from "./_fix-group.js";
import { isScored, onScale, reverseLookup } from "../graph/query.js";
import type { ResolveClass } from "../graph/resolve/types.js";

const RULE_ID = "tokens/no-hardcoded-border-width";
const MAX_FILE_BYTES = 1_000_000;
const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;
const README_CANDIDATES = ["README.md", "README", "readme.md", "README.mdx"];

// Longhand `border-width` / `border-<side>-width`.
const RE_BW_LONGHAND = /\bborder(?:-(?:top|right|bottom|left))?-width\s*:\s*([^;}{]+)/gi;
// Shorthand `border` / `border-<side>` (NOT border-radius/color/style — those
// don't have `:` immediately after the optional side).
const RE_BORDER_SHORTHAND = /\bborder(?:-(?:top|right|bottom|left))?\s*:\s*([^;}{]+)/gi;
const RE_LENGTH = /(-?\d*\.?\d+)(px|rem|em)\b/i;

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
  for (const c of README_CANDIDATES) {
    const abs = join(repoRoot, c);
    if (!existsSync(abs)) continue;
    const content = readFileIfSmall(abs);
    if (content !== null && content.includes(DISABLE_DIRECTIVE)) return true;
  }
  return false;
}
function lineFromIndex(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

// A width literal is exempt when it's 0 or the ubiquitous 1px hairline.
function isExemptWidth(raw: string): boolean {
  const m = RE_LENGTH.exec(raw);
  if (!m) return true;
  const n = Number.parseFloat(m[1]!);
  return n === 0 || (n === 1 && m[2]!.toLowerCase() === "px");
}

interface Hit { raw: string; index: number; }
function extractBorderWidths(text: string): Hit[] {
  const hits: Hit[] = [];
  for (const re of [RE_BW_LONGHAND, RE_BORDER_SHORTHAND]) {
    re.lastIndex = 0;
    let d: RegExpExecArray | null;
    while ((d = re.exec(text)) !== null) {
      const value = d[1]!;
      if (/var\(/i.test(value)) continue;
      const lm = RE_LENGTH.exec(value);
      if (!lm) continue; // keyword (thin/medium/thick) or no length
      if (isExemptWidth(lm[0]!)) continue;
      const index = d.index + d[0]!.indexOf(value) + lm.index;
      if (isInCommentOrUrl(text, index) || isCssCustomPropertyDeclaration(text, index)) continue;
      hits.push({ raw: lm[0]!, index });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

function borderWidthOnScale(ctx: RuleContext, raw: string): boolean {
  if (ctx.graph) return onScale(ctx.graph, "borderWidth", raw);
  if (!ctx.tokens) return false;
  return ctx.tokens.borderWidth.has(raw);
}

function borderWidthCandidates(ctx: RuleContext, raw: string): string[] {
  if (ctx.graph) return reverseLookup(ctx.graph, "borderWidth", raw);
  if (!ctx.tokens) return [];
  return ctx.tokens.borderWidth.get(raw) ?? [];
}

function borderWidthFixGroup(ctx: RuleContext, raw: string): FixGroup | undefined {
  const candidates = borderWidthCandidates(ctx, raw);
  return makeFixGroup(RULE_ID, raw, candidates);
}

interface BorderWidthVerdict {
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
 * repo's own border-width scale — compliant, not drift — so it is handled as
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
 * Builds the finding fields for one detected border-width literal, or
 * `undefined` when nothing should be emitted. Mirrors
 * tokens-no-hardcoded-spacing.ts's `spacingVerdict` — see that file's
 * docstring for the full rationale (legacy vs. resolver path, why `near`
 * carries a candidate but `novel` never does, why `exact`/`unresolved` skip).
 */
function borderWidthVerdict(ctx: RuleContext, raw: string): BorderWidthVerdict | undefined {
  if (!ctx.resolver) {
    if (borderWidthOnScale(ctx, raw)) return undefined;
    const fixGroup = borderWidthFixGroup(ctx, raw);
    return {
      severity: "warning",
      suggestion: "reference a border-width token (e.g. `--border-width-thick`) instead of a raw length",
      ...(fixGroup !== undefined && { fixGroup }),
    };
  }

  const resolution = ctx.resolver.resolve("borderWidth", raw);
  if (resolution.class === "exact" || resolution.class === "unresolved") return undefined;

  const { severity, confidence } = VERDICT_BY_CLASS[resolution.class];
  const fixGroup = makeFixGroup(RULE_ID, raw, []);
  const suggestion =
    resolution.class === "near" && resolution.tokenIds[0] !== undefined
      ? `probably \`${resolution.tokenIds[0]}\` — verify before replacing`
      : undefined;
  return {
    severity,
    confidence,
    ...(suggestion !== undefined && { suggestion }),
    ...(fixGroup !== undefined && { fixGroup }),
  };
}

const evaluate = async (ctx: RuleContext, files: ParsedFiles): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (ctx.repoRoot && isAllowlisted(ctx.repoRoot)) return { findings, opportunities: 0 };
  let opportunities = 0;
  const sources = [
    ...files.css.filter((f) => !f.skipped).map((f) => ({ path: f.path, source: f.source })),
    ...files.cssInJs.map((b) => ({ path: b.path, source: b.content })),
  ];
  for (const { path, source } of sources) {
    if (ctx.graph && !isScored(ctx.graph, path)) continue;
    for (const hit of extractBorderWidths(source)) {
      opportunities++;
      const verdict = borderWidthVerdict(ctx, hit.raw);
      if (!verdict) continue;
      findings.push({
        ruleId: RULE_ID,
        axis: "tokens",
        severity: verdict.severity,
        ...(verdict.confidence !== undefined && { confidence: verdict.confidence }),
        location: { file: path, line: lineFromIndex(source, hit.index), column: 1 },
        message: `Hardcoded border-width \`${hit.raw}\` — border thickness should come from a token scale`,
        ...(verdict.suggestion !== undefined && { suggestion: verdict.suggestion }),
        ...(verdict.fixGroup !== undefined && { fixGroup: verdict.fixGroup }),
      });
    }
  }
  return { findings, opportunities };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "tokens",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Border thickness should come from a token scale",
    fullDescription:
      "Flags hardcoded border-width length literals (px/rem/em) in CSS / CSS-in-JS — both the `border-width` / `border-<side>-width` longhands and the first length inside a `border` / `border-<side>` shorthand — that are not drawn from a border-width token scale. `0`, the ubiquitous `1px` hairline, and tokenized references (`var(--border-width-*)`) are exempt. When a border-width scale is loaded (`ctx.tokens.borderWidth`), on-scale values are compliant; off-scale values are flagged.",
    helpUri: "https://github.com/lyse-labs/lyse/blob/main/docs/rules/tokens-no-hardcoded-border-width.md",
    rationale: `Why it matters

Border thicknesses beyond the default hairline (\`2px\`, \`3px\`, \`0.5px\`) should be deliberate, named choices, not magic numbers sprinkled per component. A small border-width scale keeps emphasis borders consistent. Value-drift rule.`,
    examples: [
      { good: ":root { --border-width-thick: 2px; }\n.active { border: var(--border-width-thick) solid; }", bad: ".active { border: 3px solid; }" },
    ],
    allowlist: [
      "repos containing `lyse-disable tokens/no-hardcoded-border-width` in a README — rule is N/A",
      "`0` and the `1px` hairline — never flagged",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});
