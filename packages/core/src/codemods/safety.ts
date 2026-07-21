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
 * derivation, used by the audit pipeline's confidence classification.
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
 * Populate `Finding.confidence` on every finding in an AuditResult. Most rules
 * still emit findings without a confidence field (the context needed for
 * classification is repo-wide, not rule-local), so this helper closes the gap
 * once per run via the owning rule's `classifyConfidence` instead of having
 * every consumer recompute it. Resolver-driven rules (graph/resolve; see
 * tokens/no-hardcoded-color) are the exception — the resolver IS repo-wide
 * context available at emit time, so those rules set `confidence` themselves
 * and that value wins here; `classifyConfidence` remains the fallback for
 * every rule that does not set one. Downstream CLI consumers (score gauge,
 * ESLint-style tag, post-audit menu) all read `finding.confidence`.
 *
 * Returns a NEW result with new finding objects (no in-place mutation) so
 * cached or reused references stay untouched.
 */
export function populateConfidence(result: AuditResult, ctx: ClassifyContext): AuditResult {
  return {
    ...result,
    findings: result.findings.map((f) => ({
      ...f,
      confidence: f.confidence ?? classifyConfidence(f, ctx),
    })),
  };
}
