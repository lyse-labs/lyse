import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding, FixGroup, Confidence } from "../types.js";
import { createLyseRule } from "./_rule-module.js";
import { isInCommentOrUrl, isCssCustomPropertyDeclaration } from "./_skip-context.js";
import { makeFixGroup } from "./_fix-group.js";
import { isScored, onScale, reverseLookup } from "../graph/query.js";

const RULE_ID = "tokens/no-hardcoded-typography";
const MAX_FILE_BYTES = 1_000_000;
const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;
const README_CANDIDATES = ["README.md", "README", "readme.md", "README.mdx"];

// Per-property declaration matchers. `line-height` is intentionally OUT of
// scope: unitless line-heights (1.4, 1.5, …) are pervasive and rarely
// tokenized, so flagging them is noise, not signal.
const RE_FONT_SIZE = /\bfont-size\s*:\s*([^;}{]+)/gi;
const RE_FONT_WEIGHT = /\bfont-weight\s*:\s*([^;}{]+)/gi;
const RE_LETTER_SPACING = /\bletter-spacing\s*:\s*([^;}{]+)/gi;
const RE_LENGTH = /(-?\d*\.?\d+)(px|rem|em)\b/i;
// 400 (normal) and 700 (bold) are the canonical defaults — treated as keywords.
const EXEMPT_WEIGHTS = new Set([400, 700]);

interface TypoHit {
  prop: "font-size" | "font-weight" | "letter-spacing";
  raw: string;
  scaleKey: string;
  index: number;
}

function extractTypography(text: string): TypoHit[] {
  const hits: TypoHit[] = [];

  RE_FONT_SIZE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_FONT_SIZE.exec(text)) !== null) {
    const v = m[1]!;
    if (/var\(/i.test(v)) continue;
    const lm = RE_LENGTH.exec(v);
    if (!lm) continue; // % / keyword (medium, larger…) → not drift
    if (isInCommentOrUrl(text, m.index) || isCssCustomPropertyDeclaration(text, m.index)) continue;
    hits.push({ prop: "font-size", raw: lm[0]!, scaleKey: lm[0]!, index: m.index });
  }

  RE_FONT_WEIGHT.lastIndex = 0;
  while ((m = RE_FONT_WEIGHT.exec(text)) !== null) {
    const v = m[1]!;
    if (/var\(/i.test(v)) continue;
    const wm = /\b(\d{2,4})\b/.exec(v);
    if (!wm) continue; // keyword (normal/bold/lighter/bolder)
    const n = Number.parseInt(wm[1]!, 10);
    if (EXEMPT_WEIGHTS.has(n)) continue;
    if (isInCommentOrUrl(text, m.index) || isCssCustomPropertyDeclaration(text, m.index)) continue;
    hits.push({ prop: "font-weight", raw: String(n), scaleKey: `weight/${n}`, index: m.index });
  }

  RE_LETTER_SPACING.lastIndex = 0;
  while ((m = RE_LETTER_SPACING.exec(text)) !== null) {
    const v = m[1]!;
    if (/var\(/i.test(v)) continue;
    const lm = RE_LENGTH.exec(v);
    if (!lm) continue; // normal / 0 (no unit) → not drift
    if (Number.parseFloat(lm[1]!) === 0) continue;
    if (isInCommentOrUrl(text, m.index) || isCssCustomPropertyDeclaration(text, m.index)) continue;
    hits.push({ prop: "letter-spacing", raw: lm[0]!, scaleKey: `letter-spacing/${lm[0]!}`, index: m.index });
  }

  return hits.sort((a, b) => a.index - b.index);
}

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

function typographyOnScale(ctx: RuleContext, key: string): boolean {
  if (ctx.graph) return onScale(ctx.graph, "typography", key);
  if (!ctx.tokens) return false;
  return ctx.tokens.typography.has(key);
}

function typographyCandidates(ctx: RuleContext, key: string): string[] {
  if (ctx.graph) return reverseLookup(ctx.graph, "typography", key);
  if (!ctx.tokens) return [];
  return ctx.tokens.typography.get(key) ?? [];
}

function typographyFixGroup(ctx: RuleContext, hit: TypoHit): FixGroup | undefined {
  const candidates = typographyCandidates(ctx, hit.scaleKey);
  return makeFixGroup(RULE_ID, hit.scaleKey, candidates);
}

interface TypographyVerdict {
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
 * Builds the finding fields for one detected typography literal, or
 * `undefined` when nothing should be emitted.
 *
 * Legacy path (no `ctx.resolver`): byte-identical to the pre-resolver rule —
 * always `warning`, the static suggestion text, fixGroup from the flat
 * `hit.scaleKey` lookup (already prefixed `weight/` / `letter-spacing/` where
 * relevant — see `extractTypography`).
 *
 * Resolver path: font-size/font-weight/letter-spacing are each a single
 * scalar, but they are NOT comparable across each other on one numeric line —
 * `13px` and `650` and `0.4px` share no unit — so this axis is routed through
 * `classifyComposite` (string equality on `hit.scaleKey`), exactly like
 * shadows. It never returns `near`: only `exact` (on-scale, compliant, skip),
 * `novel` (a real value with no known token — report it, don't claim it's
 * drift), and `unresolved` (opaque literal, already filtered out upstream by
 * `extractTypography`'s `var()` guard). No `near` branch is written — there is
 * nothing to write.
 */
function typographyVerdict(ctx: RuleContext, hit: TypoHit): TypographyVerdict | undefined {
  if (!ctx.resolver) {
    if (typographyOnScale(ctx, hit.scaleKey)) return undefined;
    const fixGroup = typographyFixGroup(ctx, hit);
    return {
      severity: "warning",
      suggestion: "reference a typography token (e.g. `--font-size-md`, `--font-weight-semibold`) instead of a raw value",
      ...(fixGroup !== undefined && { fixGroup }),
    };
  }

  const resolution = ctx.resolver.resolve("typography", hit.scaleKey);
  if (resolution.class !== "novel") return undefined;
  const fixGroup = makeFixGroup(RULE_ID, hit.scaleKey, []);
  return {
    severity: "info",
    confidence: "low",
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
    for (const hit of extractTypography(source)) {
      opportunities++;
      const verdict = typographyVerdict(ctx, hit);
      if (!verdict) continue;
      findings.push({
        ruleId: RULE_ID,
        axis: "tokens",
        severity: verdict.severity,
        ...(verdict.confidence !== undefined && { confidence: verdict.confidence }),
        location: { file: path, line: lineFromIndex(source, hit.index), column: 1 },
        message: `Hardcoded ${hit.prop} \`${hit.raw}\` — typography should come from a type token scale`,
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
    shortDescription: "Typography should come from a type token scale",
    fullDescription:
      "Flags hardcoded `font-size`, `font-weight`, and `letter-spacing` values in CSS / CSS-in-JS that aren't drawn from a typography token scale (`ctx.tokens.typography`, with `weight/` and `letter-spacing/` prefixed keys). Exemptions keep precision high: `font-size` only flags px/rem/em (percentages and keywords are exempt); `font-weight` exempts the canonical `400`/`700` and all keywords; `letter-spacing` exempts `0` and `normal`; `var(...)` is always exempt. `line-height` is intentionally out of scope — unitless line-heights are pervasive and rarely tokenized, so flagging them is noise.",
    helpUri: "https://github.com/lyse-labs/lyse/blob/main/docs/rules/tokens-no-hardcoded-typography.md",
    rationale: `Why it matters

A type scale (\`--font-size-sm/md/lg\`, \`--font-weight-regular/semibold\`) is the backbone of a design system's voice. Ad-hoc \`font-size: 13px\` / \`font-weight: 650\` scattered per component erode that scale into dozens of near-duplicates. Value-drift rule.`,
    examples: [
      { good: ":root { --font-size-sm: 13px; }\n.label { font-size: var(--font-size-sm); }", bad: ".label { font-size: 13px; font-weight: 650; }" },
    ],
    allowlist: [
      "repos containing `lyse-disable tokens/no-hardcoded-typography` in a README — rule is N/A",
      "`font-weight: 400`/`700`, percentage/keyword font-sizes, `letter-spacing: 0`, and `line-height` (out of scope) — never flagged",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = { extractTypography, isAllowlisted, DISABLE_DIRECTIVE };
