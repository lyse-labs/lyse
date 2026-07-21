import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding, FixGroup, Confidence } from "../types.js";
import { createLyseRule } from "./_rule-module.js";
import { isInCommentOrUrl, isCssCustomPropertyDeclaration } from "./_skip-context.js";
import { makeFixGroup } from "./_fix-group.js";
import { isScored, onScale, reverseLookup } from "../graph/query.js";
import type { ResolveClass } from "../graph/resolve/types.js";

const RULE_ID = "tokens/no-hardcoded-z-index";
const MAX_FILE_BYTES = 1_000_000;

const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;
const README_CANDIDATES = ["README.md", "README", "readme.md", "README.mdx"];

// `z-index: <int>` (also matches CSS-in-JS `zIndex: <int>` once the kebab/camel
// is normalized — the optional dash + case-insensitive flag covers both).
const RE_Z_INDEX = /\bz-?index\s*:\s*(-?\d+)\b/gi;
// Local stacking-context values that are not "z-index war" drift.
const TRIVIAL = new Set([-1, 0, 1]);

interface ZIndexHit {
  value: number;
  index: number;
}

function extractZIndexValues(text: string): ZIndexHit[] {
  const hits: ZIndexHit[] = [];
  RE_Z_INDEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_Z_INDEX.exec(text)) !== null) {
    const value = Number.parseInt(m[1]!, 10);
    if (Number.isNaN(value) || TRIVIAL.has(value)) continue;
    if (isInCommentOrUrl(text, m.index) || isCssCustomPropertyDeclaration(text, m.index)) continue;
    hits.push({ value, index: m.index });
  }
  return hits;
}

function lineFromIndex(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
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
  for (const candidate of README_CANDIDATES) {
    const abs = join(repoRoot, candidate);
    if (!existsSync(abs)) continue;
    const content = readFileIfSmall(abs);
    if (content !== null && content.includes(DISABLE_DIRECTIVE)) return true;
  }
  return false;
}

function zIndexOnScale(ctx: RuleContext, strValue: string): boolean {
  if (ctx.graph) return onScale(ctx.graph, "zIndex", strValue);
  const scale = ctx.tokens?.zIndex ?? null;
  return scale !== null && scale.has(strValue);
}

function zIndexFixGroup(ctx: RuleContext, strValue: string): FixGroup | undefined {
  if (ctx.graph) return makeFixGroup(RULE_ID, strValue, reverseLookup(ctx.graph, "zIndex", strValue));
  if (!ctx.tokens) return undefined;
  return makeFixGroup(RULE_ID, strValue, ctx.tokens.zIndex.get(strValue));
}

/**
 * Fixed remediation hint, emitted on BOTH paths — see the identical constant in
 * `tokens-no-hardcoded-shadow.ts`. On the `near` sub-path the resolver's own
 * candidate token is strictly more specific and supersedes it; a `novel` has no
 * candidate to name, so it keeps the hint the legacy path always emitted rather
 * than saying nothing at all. `lyse handoff` reads `suggestion` verbatim.
 */
const STATIC_SUGGESTION =
  "define a z-index scale (e.g. `--z-modal`, `--z-popover`) and reference it instead of a raw value";

interface ZIndexVerdict {
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
 * repo's own z-index scale — compliant, not drift — so it is handled as an
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
 * Builds the finding fields for one detected z-index literal, or `undefined`
 * when nothing should be emitted. Mirrors tokens-no-hardcoded-spacing.ts's
 * `spacingVerdict` — see that file's docstring for the full rationale (legacy
 * vs. resolver path, why `near` names a candidate token while `novel` falls
 * back to the static hint, why `exact`/`unresolved` skip).
 */
function zIndexVerdict(ctx: RuleContext, strValue: string): ZIndexVerdict | undefined {
  if (!ctx.resolver) {
    // On-scale values are compliant (counted as opportunity, not flagged).
    if (zIndexOnScale(ctx, strValue)) return undefined;
    const fixGroup = zIndexFixGroup(ctx, strValue);
    return {
      severity: "warning",
      suggestion: STATIC_SUGGESTION,
      ...(fixGroup !== undefined && { fixGroup }),
    };
  }

  const resolution = ctx.resolver.resolve("zIndex", strValue);
  if (resolution.class === "exact" || resolution.class === "unresolved") return undefined;

  const { severity, confidence } = VERDICT_BY_CLASS[resolution.class];
  const fixGroup = makeFixGroup(RULE_ID, strValue, []);
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

  const sources: { path: string; source: string }[] = [
    ...files.css.filter((f) => !f.skipped).map((f) => ({ path: f.path, source: f.source })),
    ...files.cssInJs.map((b) => ({ path: b.path, source: b.content })),
  ];

  for (const { path, source } of sources) {
    if (ctx.graph && !isScored(ctx.graph, path)) continue;
    for (const hit of extractZIndexValues(source)) {
      opportunities++;
      const strValue = String(hit.value);
      const verdict = zIndexVerdict(ctx, strValue);
      if (!verdict) continue;
      findings.push({
        ruleId: RULE_ID,
        axis: "tokens",
        severity: verdict.severity,
        ...(verdict.confidence !== undefined && { confidence: verdict.confidence }),
        location: { file: path, line: lineFromIndex(source, hit.index), column: 1 },
        message: `Hardcoded z-index \`${hit.value}\` — stacking order should come from a z-index token scale`,
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
    shortDescription: "Stacking order should come from a z-index token scale",
    fullDescription:
      "Flags hardcoded `z-index` integer literals in CSS and CSS-in-JS that are not drawn from a z-index token scale. Trivial local stacking values (`-1`, `0`, `1`) and tokenized references (`var(--z-*)`) are exempt. When a z-index token scale is loaded (`ctx.tokens.zIndex`), values on the scale are treated as compliant; off-scale values are flagged. This catches the classic 'z-index war' anti-pattern where arbitrary magic numbers (`9999`, `99999`) accrete across a codebase with no shared ordering.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/tokens-no-hardcoded-z-index.md",
    rationale: `Why it matters

Z-index without a shared scale is one of the most common sources of UI bugs in a design system: each component picks an arbitrary large number to "win", and overlays, dropdowns, tooltips and modals end up fighting unpredictably. A small, named z-index scale (\`--z-dropdown\`, \`--z-modal\`, \`--z-toast\`) makes stacking order an explicit, reviewable decision.

This is a value-drift rule, in the same family as the other hardcoded-value detectors.`,
    examples: [
      {
        good: ":root { --z-modal: 400; }\n.modal { z-index: var(--z-modal); }",
        bad: ".modal { z-index: 9999; }",
      },
    ],
    allowlist: [
      "repos containing `lyse-disable tokens/no-hardcoded-z-index` in a README — rule is N/A",
      "trivial local stacking values `-1`, `0`, `1` — never flagged",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  extractZIndexValues,
  isAllowlisted,
  DISABLE_DIRECTIVE,
};
