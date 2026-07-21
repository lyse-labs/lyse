import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding, FixGroup, Confidence } from "../types.js";
import { createLyseRule } from "./_rule-module.js";
import { isInCommentOrUrl, isCssCustomPropertyDeclaration } from "./_skip-context.js";
import { makeFixGroup } from "./_fix-group.js";
import { isScored, onScale, reverseLookup } from "../graph/query.js";
import type { ResolveClass } from "../graph/resolve/types.js";

const RULE_ID = "tokens/no-hardcoded-opacity";
const MAX_FILE_BYTES = 1_000_000;
const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;
const README_CANDIDATES = ["README.md", "README", "readme.md", "README.mdx"];

const RE_OPACITY = /\bopacity\s*:\s*(-?[\d.]+)(%?)/gi;

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

interface Hit { raw: string; norm: number; index: number; }
function extractOpacity(text: string): Hit[] {
  const hits: Hit[] = [];
  RE_OPACITY.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_OPACITY.exec(text)) !== null) {
    const n = Number.parseFloat(m[1]!);
    if (Number.isNaN(n)) continue;
    const norm = m[2] === "%" ? n / 100 : n;
    if (norm === 0 || norm === 1) continue; // semantic extremes, not drift
    if (isInCommentOrUrl(text, m.index) || isCssCustomPropertyDeclaration(text, m.index)) continue;
    hits.push({ raw: m[1]! + m[2]!, norm, index: m.index });
  }
  return hits;
}

function opacityOnScale(ctx: RuleContext, hit: { raw: string; norm: number }): boolean {
  if (ctx.graph) {
    return onScale(ctx.graph, "opacity", hit.raw) || onScale(ctx.graph, "opacity", String(hit.norm));
  }
  const scale = ctx.tokens?.opacity ?? null;
  return scale !== null && (scale.has(hit.raw) || scale.has(String(hit.norm)));
}

function opacityCandidates(ctx: RuleContext, hit: { raw: string; norm: number }): string[] {
  if (ctx.graph) {
    const byRaw = reverseLookup(ctx.graph, "opacity", hit.raw);
    return byRaw.length > 0 ? byRaw : reverseLookup(ctx.graph, "opacity", String(hit.norm));
  }
  if (!ctx.tokens) return [];
  return ctx.tokens.opacity.get(hit.raw) ?? ctx.tokens.opacity.get(String(hit.norm)) ?? [];
}

function opacityFixGroup(ctx: RuleContext, hit: { raw: string; norm: number }): FixGroup | undefined {
  const candidates = opacityCandidates(ctx, hit);
  return makeFixGroup(RULE_ID, hit.raw, candidates);
}

/**
 * Fixed remediation hint, emitted on BOTH paths — see the identical constant in
 * `tokens-no-hardcoded-shadow.ts`. On the `near` sub-path the resolver's own
 * candidate token is strictly more specific and supersedes it; a `novel` has no
 * candidate to name, so it keeps the hint the legacy path always emitted rather
 * than saying nothing at all. `lyse handoff` reads `suggestion` verbatim.
 */
const STATIC_SUGGESTION =
  "reference an opacity token (e.g. `--opacity-disabled`) instead of a raw value";

interface OpacityVerdict {
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
 * repo's own opacity scale — compliant, not drift — so it is handled as an
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
 * Builds the finding fields for one detected opacity literal, or `undefined`
 * when nothing should be emitted. Mirrors tokens-no-hardcoded-spacing.ts's
 * `spacingVerdict` — see that file's docstring for the full rationale (legacy
 * vs. resolver path, why `near` names a candidate token while `novel` falls
 * back to the static hint, why `exact`/`unresolved` skip).
 *
 * The resolve key is `hit.norm` (the 0–1 normalised fraction), not
 * `hit.raw`: a `65%` literal has no numeric parse under `numericValue`
 * (percent is not px/rem/em/unitless), so it must be compared against the
 * axis's fractional scale in its normalised form, same as `opacityOnScale`
 * already does for the legacy path.
 */
function opacityVerdict(ctx: RuleContext, hit: { raw: string; norm: number }): OpacityVerdict | undefined {
  if (!ctx.resolver) {
    if (opacityOnScale(ctx, hit)) return undefined;
    const fixGroup = opacityFixGroup(ctx, hit);
    return {
      severity: "warning",
      suggestion: STATIC_SUGGESTION,
      ...(fixGroup !== undefined && { fixGroup }),
    };
  }

  const resolution = ctx.resolver.resolve("opacity", String(hit.norm));
  if (resolution.class === "exact" || resolution.class === "unresolved") return undefined;

  const { severity, confidence } = VERDICT_BY_CLASS[resolution.class];
  const fixGroup = makeFixGroup(RULE_ID, hit.raw, []);
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
    for (const hit of extractOpacity(source)) {
      opportunities++;
      const verdict = opacityVerdict(ctx, hit);
      if (!verdict) continue;
      findings.push({
        ruleId: RULE_ID,
        axis: "tokens",
        severity: verdict.severity,
        ...(verdict.confidence !== undefined && { confidence: verdict.confidence }),
        location: { file: path, line: lineFromIndex(source, hit.index), column: 1 },
        message: `Hardcoded opacity \`${hit.raw}\` — opacity should come from a token scale`,
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
    shortDescription: "Opacity should come from a token scale",
    fullDescription:
      "Flags hardcoded fractional `opacity` values in CSS / CSS-in-JS that are not drawn from an opacity token scale. The semantic extremes `0` and `1` and tokenized references (`var(--opacity-*)`) are exempt. When an opacity token scale is loaded (`ctx.tokens.opacity`), on-scale values are compliant; off-scale values are flagged.",
    helpUri: "https://github.com/lyse-labs/lyse/blob/main/docs/rules/tokens-no-hardcoded-opacity.md",
    rationale: `Why it matters

Ad-hoc opacity values (\`0.65\`, \`0.38\`, \`0.87\`) scattered across a system produce subtly inconsistent muted/disabled/overlay states. A small named opacity scale keeps those states coherent. Value-drift rule.`,
    examples: [
      { good: ":root { --opacity-muted: 0.6; }\n.muted { opacity: var(--opacity-muted); }", bad: ".muted { opacity: 0.65; }" },
    ],
    allowlist: [
      "repos containing `lyse-disable tokens/no-hardcoded-opacity` in a README — rule is N/A",
      "the extremes `0` and `1` — never flagged",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = { extractOpacity, isAllowlisted, DISABLE_DIRECTIVE };
