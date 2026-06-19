# ai-governance/product-analytics — rule design

> Issue: lyse-labs/lyse-internal#100 (frontier/ai-product-analytics, static slice)
> Status: approved (Noé, 2026-06-19, brainstorming)

## Goal

A deterministic rule that flags an AI surface whose accept/reject/feedback
interaction handlers ship **without any product-analytics instrumentation** in
the file — the "unmeasured AI feedback loop." Static presence only (one
analytics call satisfies it); not correctness. Ships **experimental/advisory**,
then generators → recall run → promote per the established playbook.

## Why

If a product puts AI accept/reject/feedback controls in the UI but never
instruments them, it cannot measure acceptance/rejection rates — it flies blind
on its own AI quality. Detecting the *presence* of instrumentation on those
surfaces is a cheap, high-signal static check.

## Identity

- File: `packages/core/src/rules/ai-governance-product-analytics.ts`
- Axis: `ai-governance` (the issue's "frontier" is a track label, not an axis;
  every AI rule lives under `ai-governance`).
- ruleId: `ai-governance/product-analytics`
- Sub-axis: `ai-governance.product-analytics`
- `defaultSeverity: "warning"`
- Reliability: `status: "experimental"`, `contributesToScore: false`,
  `llmDriven: false`, `precisionMeasured: null`, `recallMeasured: 1` (placeholder
  until the recall run).

## In-scope predicate (else N/A — no finding)

A file is in-scope iff BOTH hold:
1. **AI surface:** `fileHasAiMarker(source, relPath, repoRoot)` is true
   (reuse the existing export from `ai-governance-ai-marker-component-present.ts`).
2. **Has an accept/reject/feedback handler.** Detect via word-bounded regex
   (mirroring `human-control-affordances`'s `HANDLER_PROP_RE`/`DATA_ACTION_RE`):
   - JSX handler props: `onAccept | onReject | onApprove | onThumbsUp |
     onThumbsDown | onRate | onFeedback` (followed by `=`).
   - `data-action="accept | reject | feedback | thumbs-up | thumbs-down | rate"`.

Files that are not AI surfaces, or AI surfaces with no such handler, produce no
finding (the rule is not applicable).

## Instrumentation-presence check

Does the in-scope file contain ≥1 analytics/telemetry call? Curated,
word-bounded signal set (narrow first — precision over recall; the recall run
calibrates it):
- bare calls: `track(`, `trackEvent(`, `captureEvent(`, `logEvent(`, `gtag(`
- member calls: `.track(`, `.capture(`, `dataLayer.push(`
- known-SDK prefixes: `posthog.`, `mixpanel.`, `amplitude.`, `segment.`,
  `analytics.`
- hook: `useAnalytics`

Word boundaries (`\b`) avoid substring false positives (e.g. `backtrack(`).

## Finding semantics

- in-scope AND no instrumentation present → **one** finding at the first
  accept/reject/feedback handler's location, severity `warning`, message:
  "AI accept/reject/feedback events are not instrumented for product analytics."
- in-scope AND instrumentation present → no finding.
- File-level presence: a single analytics call anywhere in the file satisfies
  the check (per the "presence only" scope).

## Architecture / units

- `detectInteractionHandlers(source): HandlerHit[]` — pure; returns handler
  matches with line numbers. Unit-tested.
- `hasAnalyticsInstrumentation(source): boolean` — pure; the curated-signal
  scan. Unit-tested.
- `rule` via `createLyseRule({ meta, defaultOptions: [], create })` — `evaluate`
  walks component files (same `COMPONENT_GLOB` + ignore set as the marker rule),
  applies the in-scope predicate, emits findings. Integration-tested.

Both helpers are exported for unit tests, mirroring `human-control-affordances`.

## Registration & catalogue

- Import + add to `ruleObjects` in `packages/core/src/rules/registry.ts`.
- Add the `ai-governance.product-analytics` record to
  `packages/core/src/reliability/catalogue/sub-axes.ts` (experimental,
  contributesToScore false, ruleIds `["ai-governance/product-analytics"]`).
- `manifest.ts` derives from the rule's `meta` — do not edit it.

## Testing (TDD)

Unit (`tests/rules/ai-governance-product-analytics.test.ts`):
- `detectInteractionHandlers`: detects `onAccept`/`onReject`/`onFeedback` props
  and `data-action="accept"`; returns correct line; ignores unrelated props.
- `hasAnalyticsInstrumentation`: true for `track(...)`, `posthog.capture(...)`,
  `gtag(...)`, `useAnalytics`; false for none; no substring FP (`backtrack(`).

Integration (`rule.evaluate` on temp repos, mirroring the marker-rule tests):
- AI surface + accept/reject handler + NO analytics → 1 warning.
- AI surface + handler + analytics call → 0 findings.
- Non-AI file with handlers → 0 (out of scope).
- AI surface with no accept/reject/feedback handler → 0 (out of scope).

## Docs

`docs/rules/ai-governance-product-analytics.md` following the existing rule-doc
template (what/why/examples/allowlist), linked from `meta.helpUri`.

## Scope of this cycle (issue exit gate)

Ship the rule **advisory/experimental** with fixtures + rule doc + tests in the
public repo. Promotion (recall-suite generators in lyse-internal → recall run →
flip to stable) is a separate follow-up, exactly as every prior AI rule shipped.

## Out of scope

- Per-handler proximity / AST function-body analysis (file-level presence chosen).
- Firing on non-AI surfaces (AI-marker-gated chosen).
- Validating analytics *correctness* (only presence).
- MCP resource surfacing — only if it drops cleanly into M1's existing scheme;
  not a gate for this slice.
