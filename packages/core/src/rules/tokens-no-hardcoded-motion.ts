import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding, TokenMap, FixGroup } from "../types.js";
import { createLyseRule } from "./_rule-module.js";
import { isInCommentOrUrl, isCssCustomPropertyDeclaration } from "./_skip-context.js";
import { makeFixGroup } from "./_fix-group.js";
import { isScored, onScale as onScaleGraph, reverseLookup } from "../graph/query.js";

const RULE_ID = "tokens/no-hardcoded-motion";
const MAX_FILE_BYTES = 1_000_000;
const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;
const README_CANDIDATES = ["README.md", "README", "readme.md", "README.mdx"];

// `transition` / `transition-duration` / `animation` / `animation-duration`
// declarations (NOT -timing-function / -delay — those are handled or excluded).
const RE_DURATION_DECL = /\b(?:transition|animation)(?:-duration)?\s*:\s*([^;}{]+)/gi;
const RE_TIME = /(-?\d*\.?\d+)(ms|s)\b/gi;
// Custom easing curves are drift; standard keywords (ease, linear, …) are not.
const RE_CUBIC_BEZIER = /cubic-bezier\([^)]*\)/gi;

interface MotionHit {
  kind: "duration" | "easing";
  raw: string;
  index: number;
}

// A value in a comment/URL, or inside a `--custom-prop:` declaration (a token
// *definition*, not drift), is not a hardcoded-value opportunity.
function isSkippedContext(text: string, index: number): boolean {
  return isInCommentOrUrl(text, index) || isCssCustomPropertyDeclaration(text, index);
}

function extractMotion(text: string): MotionHit[] {
  const hits: MotionHit[] = [];
  RE_DURATION_DECL.lastIndex = 0;
  let d: RegExpExecArray | null;
  while ((d = RE_DURATION_DECL.exec(text)) !== null) {
    const value = d[1]!;
    if (/var\(/i.test(value)) continue;
    const valStart = d.index + d[0]!.indexOf(value);
    RE_TIME.lastIndex = 0;
    let t: RegExpExecArray | null;
    while ((t = RE_TIME.exec(value)) !== null) {
      if (Number.parseFloat(t[1]!) === 0) continue;
      const index = valStart + t.index;
      if (isSkippedContext(text, index)) continue;
      hits.push({ kind: "duration", raw: t[0]!, index });
    }
  }
  RE_CUBIC_BEZIER.lastIndex = 0;
  let c: RegExpExecArray | null;
  while ((c = RE_CUBIC_BEZIER.exec(text)) !== null) {
    if (isSkippedContext(text, c.index)) continue;
    hits.push({ kind: "easing", raw: c[0]!, index: c.index });
  }
  return hits.sort((a, b) => a.index - b.index);
}

const norm = (s: string): string => s.replace(/\s+/g, "").toLowerCase();

function motionFixGroup(ctx: RuleContext, hit: MotionHit): FixGroup | undefined {
  const prefix = hit.kind === "duration" ? "duration/" : "easing/";
  const key = prefix + norm(hit.raw);
  if (ctx.graph) return makeFixGroup(RULE_ID, hit.raw, reverseLookup(ctx.graph, "motion", key));
  if (!ctx.tokens) return undefined;
  const candidates = ctx.tokens.motion.get(key);
  return makeFixGroup(RULE_ID, hit.raw, candidates);
}

function motionOnScale(
  ctx: RuleContext,
  hit: MotionHit,
  scales: { durations: Set<string>; easings: Set<string> },
): boolean {
  if (ctx.graph) {
    const key = (hit.kind === "duration" ? "duration/" : "easing/") + norm(hit.raw);
    return onScaleGraph(ctx.graph, "motion", key);
  }
  return hit.kind === "duration" ? scales.durations.has(norm(hit.raw)) : scales.easings.has(norm(hit.raw));
}

function motionScaleSets(tokens: TokenMap | null): { durations: Set<string>; easings: Set<string> } {
  const durations = new Set<string>();
  const easings = new Set<string>();
  const scale = tokens?.motion;
  if (scale) {
    for (const key of scale.keys()) {
      if (key.startsWith("duration/")) durations.add(norm(key.slice("duration/".length)));
      else if (key.startsWith("easing/")) easings.add(norm(key.slice("easing/".length)));
    }
  }
  return { durations, easings };
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

const evaluate = async (ctx: RuleContext, files: ParsedFiles): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (ctx.repoRoot && isAllowlisted(ctx.repoRoot)) return { findings, opportunities: 0 };
  const { durations, easings } = motionScaleSets(ctx.tokens);
  let opportunities = 0;
  const sources = [
    ...files.css.filter((f) => !f.skipped).map((f) => ({ path: f.path, source: f.source })),
    ...files.cssInJs.map((b) => ({ path: b.path, source: b.content })),
  ];
  for (const { path, source } of sources) {
    if (ctx.graph && !isScored(ctx.graph, path)) continue;
    for (const hit of extractMotion(source)) {
      opportunities++;
      const onScale = motionOnScale(ctx, hit, { durations, easings });
      if (onScale) continue;
      const what = hit.kind === "duration" ? "duration" : "easing curve";
      const fixGroup = motionFixGroup(ctx, hit);
      findings.push({
        ruleId: RULE_ID,
        axis: "tokens",
        severity: "warning",
        location: { file: path, line: lineFromIndex(source, hit.index), column: 1 },
        message: `Hardcoded motion ${what} \`${hit.raw}\` — motion should come from a duration/easing token scale`,
        suggestion: "reference a motion token (e.g. `--duration-fast`, `--easing-standard`) instead of a raw value",
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
    shortDescription: "Motion durations and easings should come from a token scale",
    fullDescription:
      "Flags hardcoded motion values in CSS / CSS-in-JS: transition/animation **durations** (`<n>s` / `<n>ms`, from the longhand or the `transition`/`animation` shorthand) and custom **`cubic-bezier()` easing curves**, when they aren't drawn from a motion token scale. Zero durations, `var(...)` references, and standard easing keywords (`ease`, `linear`, `ease-in-out`, …) are exempt. When a motion token scale is loaded (`ctx.tokens.motion`, keys prefixed `duration/` / `easing/`), on-scale values are compliant (whitespace-insensitive); off-scale values are flagged.",
    helpUri: "https://github.com/lyse-labs/lyse/blob/main/docs/rules/tokens-no-hardcoded-motion.md",
    rationale: `Why it matters

Inconsistent durations (180ms here, 240ms there) and ad-hoc bezier curves make a system's motion feel incoherent and untunable. A small motion scale (\`--duration-fast/base/slow\`, \`--easing-standard/emphasized\`) makes timing a deliberate, shared decision. Value-drift rule.`,
    examples: [
      { good: ":root { --duration-base: 200ms; }\n.x { transition-duration: var(--duration-base); }", bad: ".x { transition: all 0.24s cubic-bezier(0.1, 0.2, 0.3, 0.4); }" },
    ],
    allowlist: [
      "repos containing `lyse-disable tokens/no-hardcoded-motion` in a README — rule is N/A",
      "zero durations and standard easing keywords (`ease`, `linear`, …) — never flagged",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = { extractMotion, motionScaleSets, isAllowlisted, DISABLE_DIRECTIVE };
