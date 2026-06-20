# ai-governance/product-analytics

**Axis:** `ai-governance` | **Default severity:** `warning` | **Status:** scored (v1)

---

## Why

When a product ships AI accept/reject/feedback controls but never instruments them, it cannot measure acceptance and rejection rates — it flies blind on its own AI quality. Detecting the presence of product-analytics instrumentation on those surfaces is a cheap, high-signal static check.

This rule is presence-only: it verifies that some instrumentation exists in the file, not that it is correctly wired. A repo with no AI-marker surface emits nothing and is not penalised.

---

## How

The rule globs `**/*.{tsx,jsx,vue}` (excluding `node_modules`, `dist`, `build`, `.git`, `.next`, `out`, `coverage`) and runs two independent checks on each file.

**Detection: AI-marker gate**

An AI-marker component must be present (detected via the shared `isAiMarkerName` predicate from `ai-governance/ai-marker-component-present`) for any finding to fire.

**Detection: Interaction handlers**

Language-agnostic signals are primary (code identifiers stay English even in localized products):

- JSX handler props: `onAccept`, `onReject`, `onApprove`, `onThumbsUp`, `onThumbsDown`, `onRate`, `onFeedback` (camelCase suffixes allowed, e.g. `onAcceptClick`).
- A `data-action` attribute valued `accept`, `reject`, `feedback`, `thumbs-up`, `thumbs-down`, or `rate`.

**Detection: Analytics instrumentation**

Curated, word-bounded product-analytics signal set (narrow first; the recall run calibrates breadth):

- Direct calls: `track(`, `trackEvent(`, `captureEvent(`, `logEvent(`, `gtag(`
- Member calls: `.track(`, `.capture(`
- Data-layer push: `dataLayer.push(`
- SDK prefixes: `posthog.`, `mixpanel.`, `amplitude.`, `segment.`, `analytics.`
- Hook: `useAnalytics`

**Findings**

- AI marker present + accept/reject/feedback handler found → file scanned
  - Handler found + no analytics instrumentation → `warning` at the first handler's location
  - Handler found + analytics instrumentation present → no finding
- No AI marker → no finding (silent, DS has no AI surface)

---

## Examples

**Good** — AI surface with accept/reject/feedback handlers + analytics:

```tsx
// AiSuggestion.tsx — AI surface with accept/reject + analytics
import { analytics } from './analytics';

export function AiSuggestion() {
  return <Row onAccept={() => analytics.track('ai_accepted')} onReject={() => analytics.track('ai_rejected')} />;
}
```

```tsx
// AiSuggestion.tsx — PostHog instrumentation
import PostHog from 'posthog-js';

export function AiSuggestion() {
  const handleAccept = () => {
    PostHog.capture('ai_suggestion_accepted');
    // ...
  };
  
  return <Row onAccept={handleAccept} onReject={handleReject} />;
}
```

**Bad** — AI surface with accept/reject/feedback handlers, NO analytics:

```tsx
// AiSuggestion.tsx — AI surface, accept/reject handlers, no analytics
export function AiSuggestion() {
  return <Row onAccept={accept} onReject={reject} />;
}
```

---

## Limitations

Detection is **static, name-based, and file-level**:

- A finding means "accept/reject/feedback handlers and an AI-marker component exist in the same file, and no analytics call is present" — not "the handlers are correctly instrumented at every call site".
- File-level presence check: one analytics call anywhere in the file satisfies the check. Precision-location matching (i.e. is the analytics call on *this* handler?) is deferred.
- Static substring matching means a non-handler export containing "accept" (e.g. `AcceptableValues`) co-located with an AI marker in a barrel file can trigger detection; precise matching is deferred.

## Auto-fix

None. Analytics instrumentation requires intentional setup and wiring to the correct tracking events; they cannot be mechanically generated without risk of tracking the wrong event or omitting critical context.

---

## Allowlist

Add the following directive to your `README.md` or `.lyse.yaml` to silence this rule:

```
lyse-disable ai-governance/product-analytics
```

Use this when:

- Repos containing `lyse-disable ai-governance/product-analytics` in an adjacent README or `.lyse.yaml` — rule is N/A
- Repos with no AI-marker component at all — no AI surface detected, rule emits nothing
- AI surfaces with no accept/reject/feedback handler — out of scope, rule emits nothing
- Files under `node_modules/`, `dist/`, `build/`, `.git/`, `.next/`, `out/`, `coverage/`

---

## Status

**Scored (v1):** this rule contributes to the Health Score. Promoted 2026-06-20 after clearing both gates on the synthetic recall suite (recall LB 0.901, precision LB 0.916).

---

## See also

- Track 11.5 ai-governance/product-analytics (AI instrumentation moat-scoring track, `lyse-internal`)
- Track 3.2 ai-governance/ai-marker-component-present (sibling rule — detects the AI-marker component this rule depends on)
- Microsoft Fluent 2 RAI design patterns (AI-surface instrumentation patterns)
