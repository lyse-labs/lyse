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
 * The owning rule's own verdict, or `undefined` when the rule has no
 * `classifyConfidence` hook — i.e. when it has no opinion at all. That is a
 * different signal from a hook that deliberately answered "low", and the two
 * must not be conflated: see `populateConfidence`.
 */
function hookConfidence(finding: Finding, ctx: ClassifyContext): Confidence | undefined {
  return ruleRegistry.get(finding.ruleId)?.classifyConfidence?.(finding, ctx);
}

/**
 * Dispatcher that delegates classifyConfidence to the rule that owns the finding.
 * Returns "low" (safe default) for unknown rules or rules without classifyConfidence.
 *
 * Open-Closed Principle: each rule owns its confidence classification logic.
 * This function is a thin dispatch layer, not a policy layer.
 */
export function classifyConfidence(finding: Finding, ctx: ClassifyContext): Confidence {
  return hookConfidence(finding, ctx) ?? "low";
}

/** Confidence ladder, least → most confident. */
const CONFIDENCE_ORDER: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

/** Most-conservative-wins: the lower rung of the ladder. */
function leastConfident(a: Confidence, b: Confidence): Confidence {
  return CONFIDENCE_ORDER[a] <= CONFIDENCE_ORDER[b] ? a : b;
}

/**
 * Populate `Finding.confidence` on every finding in an AuditResult. Downstream
 * CLI consumers (score gauge, ESLint-style tag, post-audit menu) all read
 * `finding.confidence`.
 *
 * PRECEDENCE — two independent signals, composed most-conservative-wins:
 *   1. The confidence the rule set at emit time (resolver-driven rules; see
 *      tokens/no-hardcoded-color). The resolver IS repo-wide context available
 *      at emit time, so those rules already know their drift class.
 *   2. The owning rule's `classifyConfidence` hook — the rule's own
 *      false-positive suppression (AST role, alpha channel, token-definition
 *      file), which repo-wide context alone cannot see.
 *
 * The hook may only DEMOTE the emission value, never promote it: a rule that
 * says "this is a functional-role color, grade it low" must still win over a
 * resolver that found an exact token match. When a finding carries NO emission
 * value, the hook's verdict is used verbatim — unchanged behaviour for every
 * rule that does not set one. When the owning rule has no hook at all, the
 * emission value stands: the dispatcher's "low" safe-default is the absence of
 * an opinion, not a demotion.
 *
 * Returns a NEW result with new finding objects (no in-place mutation) so
 * cached or reused references stay untouched.
 */
export function populateConfidence(result: AuditResult, ctx: ClassifyContext): AuditResult {
  return {
    ...result,
    findings: result.findings.map((f) => {
      const hook = hookConfidence(f, ctx);
      const emitted = f.confidence;
      if (emitted === undefined) return { ...f, confidence: hook ?? "low" };
      return { ...f, confidence: hook === undefined ? emitted : leastConfident(emitted, hook) };
    }),
  };
}
