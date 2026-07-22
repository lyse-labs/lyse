import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding, TokenMap, FixGroup, Confidence } from "../types.js";
import { createLyseRule } from "./_rule-module.js";
import { isInCommentOrUrl, isCssCustomPropertyDeclaration } from "./_skip-context.js";
import { makeFixGroup } from "./_fix-group.js";
import { isScored } from "../graph/query.js";
import type { DesignSystemGraph } from "../graph/types.js";
import type { ResolveClass } from "../graph/resolve/types.js";

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
  if (ctx.graph) return makeFixGroup(RULE_ID, hit.raw, graphMotionReverseLookup(ctx.graph, key));
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
    return graphMotionScaleSet(ctx.graph).has(key);
  }
  return hit.kind === "duration" ? scales.durations.has(norm(hit.raw)) : scales.easings.has(norm(hit.raw));
}

// graph.tokens[].rawValue is copied verbatim from the loader maps (internal
// whitespace preserved, e.g. `easing/cubic-bezier(0.4, 0, 0.2, 1)` from
// `join(", ")`) — normalize it with the same norm() the rule uses for hit
// keys, since the hit key is whitespace-stripped. See graph/extract/tokens.ts.
function graphMotionScaleSet(graph: DesignSystemGraph): Set<string> {
  const set = new Set<string>();
  for (const t of graph.tokens) if (t.axis === "motion") set.add(norm(t.rawValue));
  return set;
}

function graphMotionReverseLookup(graph: DesignSystemGraph, key: string): string[] {
  return graph.tokens
    .filter((t) => t.axis === "motion" && norm(t.rawValue) === key)
    .map((t) => t.id)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
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

/**
 * Fixed remediation hint, emitted on BOTH paths — see the identical constant in
 * `tokens-no-hardcoded-shadow.ts`. On the `near` duration sub-path the
 * resolver's own candidate token is strictly more specific and supersedes it.
 */
const STATIC_SUGGESTION =
  "reference a motion token (e.g. `--duration-fast`, `--easing-standard`) instead of a raw value";

interface MotionVerdict {
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
 * The class→finding mapping for `duration` hits. UNLIKE shadows and
 * typography (and this axis's own `easing` hits — see `motionVerdict`),
 * `near` IS reachable here: `graph/resolve/index.ts#classify` routes a
 * duration literal (`motionDuration()` parses it to milliseconds) through
 * `classifyNumeric`, the exact same numeric path `tokens-no-hardcoded-z-index.ts`
 * and the other four Task-7 axes use — verified empirically (a single- or
 * few-token duration scale puts a literal one `stepDistance` away in `near`,
 * e.g. `210ms` against a lone `duration.fast: 200ms` token). An easing curve
 * never reaches this map: `motionDuration()` returns `null` for it, so it
 * falls to `classifyComposite`, which structurally cannot return `near` (see
 * `motionVerdict`'s easing branch). This map is therefore never handed a
 * class the resolver couldn't have produced for the hit it was built from.
 */
const DURATION_VERDICT_BY_CLASS: Record<
  Extract<ResolveClass, "near" | "novel">,
  { severity: "warning" | "info"; confidence: Confidence }
> = {
  near: { severity: "warning", confidence: "medium" },
  novel: { severity: "info", confidence: "low" },
};

/**
 * Builds the finding fields for one detected motion literal, or `undefined`
 * when nothing should be emitted.
 *
 * Legacy path (no `ctx.resolver`): byte-identical to the pre-resolver rule —
 * always `warning`, the static suggestion text, fixGroup from the flat
 * `duration/` / `easing/`-prefixed scale lookup.
 *
 * Resolver path: the literal is passed AS WRITTEN (`hit.raw`, e.g. `"240ms"`
 * or `"cubic-bezier(0.1, 0.2, 0.3, 0.4)"`) — the resolver's own
 * `motionDuration()` decides whether it takes the numeric (duration) or
 * composite (easing) sub-path; no manual `duration/`/`easing/` prefixing is
 * needed or correct here (prefixing would double up on the canonical prefix
 * the resolver already understands raw literals without). `exact` (on-scale,
 * compliant) and `unresolved` (opaque literal, already filtered upstream by
 * `extractMotion`'s `var()` guard) both skip either way. For `near`/`novel`,
 * a `duration` hit gets the full numeric-axis mapping (`near` → warning/medium
 * with a candidate suggestion, mirroring z-index); an `easing` hit can only
 * ever be `novel` in practice (composite path, see `DURATION_VERDICT_BY_CLASS`'s
 * docstring) so it gets the same info/low treatment without a `near` branch to
 * write.
 */
function motionVerdict(
  ctx: RuleContext,
  hit: MotionHit,
  scales: { durations: Set<string>; easings: Set<string> },
): MotionVerdict | undefined {
  if (!ctx.resolver) {
    if (motionOnScale(ctx, hit, scales)) return undefined;
    const fixGroup = motionFixGroup(ctx, hit);
    return {
      severity: "warning",
      suggestion: STATIC_SUGGESTION,
      ...(fixGroup !== undefined && { fixGroup }),
    };
  }

  const resolution = ctx.resolver.resolve("motion", hit.raw);
  if (resolution.class === "exact" || resolution.class === "unresolved") return undefined;

  if (hit.kind === "easing") {
    // Composite path — see the docstring above: structurally never `near`.
    // With no `near` band to absorb the "one bezier parameter off" case,
    // `novel` here means both that and "an unrelated curve", so it emits
    // `warning` (as the pre-migration rule did) and leaves `confidence` to
    // `populateConfidence`'s hook. Only durations, which really do reach
    // `near`, keep the numeric `near`/`novel` split below.
    if (resolution.class !== "novel") return undefined;
    const fixGroup = makeFixGroup(RULE_ID, hit.raw, []);
    return {
      severity: "warning",
      suggestion: STATIC_SUGGESTION,
      ...(fixGroup !== undefined && { fixGroup }),
    };
  }

  const { severity, confidence } = DURATION_VERDICT_BY_CLASS[resolution.class];
  const fixGroup = makeFixGroup(RULE_ID, hit.raw, []);
  // A `near` names the actual candidate token; that is strictly more useful
  // than the generic hint, so it supersedes it. A `novel` has no candidate to
  // name and falls back to the hint the legacy path always emitted.
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
      const verdict = motionVerdict(ctx, hit, { durations, easings });
      if (!verdict) continue;
      const what = hit.kind === "duration" ? "duration" : "easing curve";
      findings.push({
        ruleId: RULE_ID,
        axis: "tokens",
        severity: verdict.severity,
        ...(verdict.confidence !== undefined && { confidence: verdict.confidence }),
        location: { file: path, line: lineFromIndex(source, hit.index), column: 1 },
        message: `Hardcoded motion ${what} \`${hit.raw}\` — motion should come from a duration/easing token scale`,
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
