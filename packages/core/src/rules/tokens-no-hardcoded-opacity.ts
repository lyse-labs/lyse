import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding, FixGroup } from "../types.js";
import { createLyseRule } from "./_rule-module.js";
import { isInCommentOrUrl, isCssCustomPropertyDeclaration } from "./_skip-context.js";
import { makeFixGroup } from "./_fix-group.js";
import { isScored, onScale, reverseLookup } from "../graph/query.js";

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
      if (opacityOnScale(ctx, hit)) continue;
      const fixGroup = opacityFixGroup(ctx, hit);
      findings.push({
        ruleId: RULE_ID,
        axis: "tokens",
        severity: "warning",
        location: { file: path, line: lineFromIndex(source, hit.index), column: 1 },
        message: `Hardcoded opacity \`${hit.raw}\` — opacity should come from a token scale`,
        suggestion: "reference an opacity token (e.g. `--opacity-disabled`) instead of a raw value",
        ...(fixGroup !== undefined && { fixGroup }),
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
