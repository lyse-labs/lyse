# ai-governance/human-control-affordances

**Axis:** `ai-governance` | **Default severity:** `warning` | **Track:** 3.6 (Face B)

---

## Why

HAX G8 (efficient correction) and HAX G9 (efficient dismissal) are foundational human-AI interaction requirements: when a design system exposes AI-generated content, users must have standardised controls to correct, stop, retry, or dismiss that output without friction.

Without corresponding affordances in the DS, consuming teams implement ad-hoc correction controls that are inconsistent, inaccessible, and miss the full correction loop. The Microsoft Fluent 2 RAI design patterns and the HAX framework both list correction and dismissal affordances as essential governance requirements for AI-augmented interfaces.

This rule performs a static affordance check: does the DS export the control vocabulary that enables correction and dismissal? Behavioural enforcement (verifying that controls appear wherever AI output is rendered) is deferred to Track 4.

---

## How

The rule globs `**/*.{tsx,jsx,vue}` (excluding `node_modules`, `dist`, `build`, `.git`, `.next`, `out`, `coverage`) and runs two independent detectors on each file.

**Group 1 — per-output controls**

Matches exported component names whose identifier (case-insensitive) contains one of:
`regenerate`, `retry`, `stopgenerat`, `editresponse`, `editoutput`, `undo`, `confirm`, `dismiss`, `accept`, `reject`, `report`, `reverttoai`, `usesuggestion`.

Also matches button/anchor element text content (case-insensitive, exact) against:
`Regenerate`, `Retry`, `Stop`, `Stop generating`, `Undo`, `Confirm`, `Dismiss`, `Accept`, `Reject`, `Report`, `Revert to AI`, `Use suggestion`.

**Group 2 — global AI toggle**

Matches exported component names containing (case-insensitive):
`aisettings`, `aipreferences`, `disableai`, `aicontrols`, `aiconfig`.

Also matches a `label` attribute value of `"Disable AI"`, `"AI features"`, `"AI settings"`, `"Enable AI"`, `"AI on"`, or `"AI off"` on any element.

**Cross-condition**

An AI-marker component must be present (detected via the shared `isAiMarkerName` predicate from `ai-governance/ai-marker-component-present`) for any finding to fire:

- AI marker present + per-output controls found → `info` (lists controls; notes global toggle presence)
- AI marker present + no per-output controls → `warning`
- No AI marker → no finding (silent, DS has no AI surface)

---

## Examples

**Good** — AI surface with full control affordances:

```tsx
// src/index.ts
export { AIBadge } from './ai-badge';
export { RegenerateButton } from './regenerate-button';
export { DismissResult } from './dismiss-result';
export { ReportButton } from './report-button';
export { RevertToAIButton } from './revert-to-ai-button';
export { UseSuggestionButton } from './use-suggestion-button';
export { AISettings } from './ai-settings';
```

```tsx
// RegenerateButton.tsx
export function RegenerateButton() {
  return <button onClick={onRegenerate}>Regenerate</button>;
}
```

```tsx
// ReportButton.tsx — report incorrect/harmful AI output
export function ReportButton() {
  return <button onClick={onReport}>Report</button>;
}
```

```tsx
// RevertToAIButton.tsx — revert a human edit back to the AI suggestion
export function RevertToAIButton() {
  return <button onClick={onRevert}>Revert to AI</button>;
}
```

```tsx
// UseSuggestionButton.tsx — accept the AI suggestion inline (GitLab "use this" affordance)
export function UseSuggestionButton() {
  return <button onClick={onUseSuggestion}>Use suggestion</button>;
}
```

**Bad** — AI surface with no correction affordances:

```tsx
// src/index.ts
export { AIBadge } from './ai-badge';
// No RegenerateButton, StopGenerating, EditResponse, or similar exported
// Users cannot correct or dismiss AI-generated output
```

---

## Limitations

Detection is **static, name-based, and co-location dependent**:

- An `info` finding means "a control-vocabulary component exists in a file that also contains an AI-marker" — not "the control is present at every AI output render site in consuming applications".
- Behavioral verification — confirming controls appear wherever AI-generated content is rendered — is deferred to Track 4.

## Auto-fix

None. Control affordances require intentional design decisions about the correction UX; they cannot be mechanically generated.

---

## Allowlist

Add the following directive to your `README.md` or `.lyse.yaml` to silence this rule:

```
lyse-disable ai-governance/human-control-affordances
```

Use this when:
- The DS is intentionally read-only (no correction UX needed by design)
- Controls are provided by consuming applications rather than the DS layer
- The repo has been audited and the absence is intentional

---

## See also

- HAX G8 — Efficient correction (Human-AI Interaction guidelines, Microsoft Research)
- HAX G9 — Efficient dismissal / opt-out (Human-AI Interaction guidelines, Microsoft Research)
- Microsoft Fluent 2 RAI design patterns (correction and dismissal affordances for AI-augmented UI)
- Track 3.2 ai-governance/ai-marker-component-present (sibling rule — detects the AI-marker component this rule cross-conditions on)
- Track 3.5 ai-governance/explainability-affordance (sibling rule — detects explainability affordances)
