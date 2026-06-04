import { ruleMap as ruleRegistry } from "../rules/registry.js";
import type { AuditResult, Finding, ClassifyContext, Confidence, TokenMap, LyseConfig } from "../types.js";

/** An empty token map — the safe fallback when a repo has no discoverable tokens. */
function emptyTokenMap(): TokenMap {
  return {
    colors: new Map(),
    spacing: new Map(),
    typography: new Map(),
    radii: new Map(),
    shadows: new Map(),
    motion: new Map(),
    breakpoints: new Map(),
    zIndex: new Map(),
    opacity: new Map(),
    borderWidth: new Map(),
    source: "mixed",
  };
}

/**
 * Build the ClassifyContext that confidence classification needs from audit
 * output. Single source of truth for the token fallback + component-set
 * derivation, shared by `fix` and the post-audit menu count.
 */
export function buildClassifyContext(
  findings: Finding[],
  tokens: TokenMap | null | undefined,
  config: LyseConfig,
  repoRoot?: string,
): ClassifyContext {
  return {
    tokens: tokens ?? emptyTokenMap(),
    components: new Set(findings.filter((f) => f.axis === "components").map((f) => f.ruleId)),
    config,
    ...(repoRoot !== undefined ? { repoRoot } : {}),
  };
}

/**
 * Count findings that `lyse fix` would auto-apply at the default "high"
 * confidence floor: those whose rule has a codemod AND classify as high
 * confidence. Mirrors `runFix`'s default filter chain (high floor, no
 * `--rule` filter) so the post-audit menu shows a count consistent with what
 * `fix` actually does. `repoRoot` must match `runFix`'s `cwd` — some rules
 * downgrade confidence based on it (e.g. token-definition files), so passing a
 * different value here would desync the menu count from the real fix count.
 */
export function countAutoFixable(
  findings: Finding[],
  tokens: TokenMap | null | undefined,
  config: LyseConfig,
  repoRoot?: string,
): number {
  const fixable = findings.filter((f) => !!ruleRegistry.get(f.ruleId)?.applyCodemod);
  const ctx = buildClassifyContext(findings, tokens, config, repoRoot);
  return groupByConfidence(fixable, ctx).high.length;
}

/**
 * Dispatcher that delegates classifyConfidence to the rule that owns the finding.
 * Returns "low" (safe default) for unknown rules or rules without classifyConfidence.
 *
 * Open-Closed Principle: each rule owns its confidence classification logic.
 * This function is a thin dispatch layer, not a policy layer.
 */
export function classifyConfidence(finding: Finding, ctx: ClassifyContext): Confidence {
  const rule = ruleRegistry.get(finding.ruleId);
  if (!rule?.classifyConfidence) {
    return "low";
  }
  return rule.classifyConfidence(finding, ctx);
}

/**
 * Group findings by confidence level, augmenting each with a `confidence` field.
 * Returns three buckets: high, medium, low (always present, may be empty).
 */
export function groupByConfidence(
  findings: Finding[],
  ctx: ClassifyContext
): Record<Confidence, Array<Finding & { confidence: Confidence }>> {
  const groups: Record<Confidence, Array<Finding & { confidence: Confidence }>> = {
    high: [],
    medium: [],
    low: [],
  };

  for (const f of findings) {
    const c = classifyConfidence(f, ctx);
    groups[c].push({ ...f, confidence: c });
  }

  return groups;
}

/**
 * Populate `Finding.confidence` on every finding in an AuditResult by running
 * each through the owning rule's `classifyConfidence`. The audit pipeline emits
 * findings without a confidence field (rules don't know their own classification
 * at emit time — the context needed for classification is repo-wide, not
 * rule-local). Downstream CLI consumers (score gauge, ESLint-style tag,
 * post-audit menu) all read `finding.confidence`, so this helper closes the
 * gap once per run instead of having every consumer recompute it.
 *
 * Returns a NEW result with new finding objects (no in-place mutation) so
 * cached or reused references stay untouched.
 */
export function populateConfidence(result: AuditResult, ctx: ClassifyContext): AuditResult {
  return {
    ...result,
    findings: result.findings.map((f) => ({
      ...f,
      confidence: classifyConfidence(f, ctx),
    })),
  };
}

/**
 * Group findings by ruleId.
 * Returns a Map where each key is a ruleId and value is the array of findings for that rule.
 */
export function groupByRule(findings: Finding[]): Map<string, Finding[]> {
  const groups = new Map<string, Finding[]>();
  for (const f of findings) {
    const arr = groups.get(f.ruleId) ?? [];
    arr.push(f);
    groups.set(f.ruleId, arr);
  }
  return groups;
}
