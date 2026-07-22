import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding, FixGroup, Confidence } from "../types.js";
import { createLyseRule } from "./_rule-module.js";
import { isInCommentOrUrl, isCssCustomPropertyDeclaration } from "./_skip-context.js";
import { makeFixGroup } from "./_fix-group.js";
import { isScored, onScale, reverseLookup } from "../graph/query.js";
import type { ResolveClass } from "../graph/resolve/types.js";

const RULE_ID = "tokens/no-hardcoded-border-radius";
const MAX_FILE_BYTES = 1_000_000;
const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;
const README_CANDIDATES = ["README.md", "README", "readme.md", "README.mdx"];

const RE_RADIUS_DECL = /\bborder(?:-(?:top|bottom)-(?:left|right))?-radius\s*:\s*([^;}{]+)/gi;
const RE_LENGTH = /(-?\d*\.?\d+)(px|rem|em)\b/gi;
// Radius >= this is the "fully rounded / pill" idiom, not a scale value.
const PILL_THRESHOLD_PX = 999;

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

interface Hit { raw: string; index: number; }
function extractRadiusLengths(text: string): Hit[] {
  const hits: Hit[] = [];
  RE_RADIUS_DECL.lastIndex = 0;
  let d: RegExpExecArray | null;
  while ((d = RE_RADIUS_DECL.exec(text)) !== null) {
    const value = d[1]!;
    if (/var\(/i.test(value)) continue; // tokenized
    const declStart = d.index + d[0]!.indexOf(value);
    RE_LENGTH.lastIndex = 0;
    let l: RegExpExecArray | null;
    while ((l = RE_LENGTH.exec(value)) !== null) {
      const n = Number.parseFloat(l[1]!);
      const px = l[2] === "px" ? n : n * 16; // rough rem/em → px for the pill guard
      if (n === 0 || px >= PILL_THRESHOLD_PX) continue;
      const index = declStart + l.index;
      if (isInCommentOrUrl(text, index) || isCssCustomPropertyDeclaration(text, index)) continue;
      hits.push({ raw: l[0]!, index });
    }
  }
  return hits;
}

function radiusOnScale(ctx: RuleContext, raw: string): boolean {
  if (ctx.graph) return onScale(ctx.graph, "radii", raw);
  if (!ctx.tokens) return false;
  return ctx.tokens.radii.has(raw);
}

function radiusCandidates(ctx: RuleContext, raw: string): string[] {
  if (ctx.graph) return reverseLookup(ctx.graph, "radii", raw);
  if (!ctx.tokens) return [];
  return ctx.tokens.radii.get(raw) ?? [];
}

function radiusFixGroup(ctx: RuleContext, raw: string): FixGroup | undefined {
  const candidates = radiusCandidates(ctx, raw);
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
  "reference a radius token (e.g. `--radius-md`) instead of a raw length";

interface RadiusVerdict {
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
 * repo's own radii scale — compliant, not drift — so it is handled as an
 * early skip below rather than appearing here. `unresolved` is also a skip:
 * the resolver could not judge this value, and (unlike colours) that
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
 * Builds the finding fields for one detected border-radius literal, or
 * `undefined` when nothing should be emitted. Mirrors
 * tokens-no-hardcoded-spacing.ts's `spacingVerdict` — see that file's
 * docstring for the full rationale (legacy vs. resolver path, why `near` names
 * a candidate token while `novel` falls back to the static hint, why
 * `exact`/`unresolved` skip).
 */
function radiusVerdict(ctx: RuleContext, raw: string): RadiusVerdict | undefined {
  if (!ctx.resolver) {
    if (radiusOnScale(ctx, raw)) return undefined;
    const fixGroup = radiusFixGroup(ctx, raw);
    return {
      severity: "warning",
      suggestion: STATIC_SUGGESTION,
      ...(fixGroup !== undefined && { fixGroup }),
    };
  }

  const resolution = ctx.resolver.resolve("radii", raw);
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
    for (const hit of extractRadiusLengths(source)) {
      opportunities++;
      const verdict = radiusVerdict(ctx, hit.raw);
      if (!verdict) continue;
      findings.push({
        ruleId: RULE_ID,
        axis: "tokens",
        severity: verdict.severity,
        ...(verdict.confidence !== undefined && { confidence: verdict.confidence }),
        location: { file: path, line: lineFromIndex(source, hit.index), column: 1 },
        message: `Hardcoded border-radius \`${hit.raw}\` — corner radius should come from a radii token scale`,
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
    shortDescription: "Corner radius should come from a radii token scale",
    fullDescription:
      "Flags hardcoded `border-radius` length literals (px/rem/em) in CSS / CSS-in-JS that are not drawn from a radii token scale. `0`, percentages, the fully-rounded pill idiom (≥ 999px), and tokenized references (`var(--radius-*)`) are exempt. When a radii token scale is loaded (`ctx.tokens.radii`), on-scale values are compliant; off-scale values are flagged.",
    helpUri: "https://github.com/lyse-labs/lyse/blob/main/docs/rules/tokens-no-hardcoded-border-radius.md",
    rationale: `Why it matters

Inconsistent corner radii (4px here, 6px there, 8px elsewhere) make a system feel unpolished. A small named radii scale keeps roundedness consistent across components. Value-drift rule.`,
    examples: [
      { good: ":root { --radius-md: 8px; }\n.card { border-radius: var(--radius-md); }", bad: ".card { border-radius: 6px; }" },
    ],
    allowlist: [
      "repos containing `lyse-disable tokens/no-hardcoded-border-radius` in a README — rule is N/A",
      "`0`, percentages, and the pill idiom (≥ 999px) — never flagged",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});
