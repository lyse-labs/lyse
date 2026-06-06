# `ai-governance/explainability-affordance`

> **Axis:** AI governance · **Severity:** warning (info when found) · **Auto-fixable:** no · **Version:** v1

Detect whether the design system ships a component or ARIA-binding that provides an explainability affordance alongside an AI-marker component. Part of Track 3.5 — Face B (AI-Governance). Guidelines: HAX G11 (Explain AI decisions) / PAIR Explainability.

## Why

Users interacting with AI-generated content have a right to understand why a particular output was produced. Design systems that ship an AI-marker component (Carbon `AILabel`, `AIBadge`, `GenAI*`, Polaris `magic-*`, etc.) but provide no companion explainability affordance leave consuming teams without a standard component to reach for. The result is ad-hoc implementations with inconsistent UX and missing accessibility attributes.

HAX G11 (IBM Human-AI Experience) and Google PAIR Explainability guidelines require that AI-powered interfaces expose an explanation pathway — a popover, citation list, confidence meter, or similar affordance — so users can evaluate trustworthiness and take informed action.

## How it works

The rule first checks whether an AI-marker component is present (using the shared `AI_MARKER_NAMES` vocabulary imported from `ai-governance/ai-marker-component-present`). If no AI-marker is found, the rule emits nothing — the DS has no AI surface.

When an AI-marker is detected, detection runs in two passes. Both passes operate on component files only — only affordances found in files that **also contain an AI-marker identifier** are credited. A `ConfidenceDisplay` component in a file with no AI-marker does not earn credit; it must be co-located with (or live in the same file as) an AI-marker component.

**Pass 1 — name-based co-location scan.** The rule globs `**/*.{tsx,jsx,vue}` (excluding `node_modules`, `dist`, `build`, `.git`, `.next`, `out`, `coverage`). For each file that contains an AI-marker identifier, it checks all exported identifiers in that file. Any name that contains one of the following patterns (case-insensitive substring match) is treated as an explainability affordance:

| Pattern | Example matches |
|---|---|
| `Explain` | `ExplainPopover`, `ExplainPanel`, `explain-button` |
| `Explainability` | `ExplainabilityDrawer` |
| `WhyThis` | `WhyThisResult`, `WhyThisSuggestion` |
| `Citation` | `CitationList`, `CitationBadge` |
| `Sources` | `SourcesPanel`, `SourcesTooltip` |
| `Confidence` | `ConfidenceDisplay`, `ConfidenceMeter` |
| `Provenance` | `ProvenanceInfo` |

**Pass 2 — ARIA popover detection.** If an AI-marker component source file contains `aria-describedby` or `role="dialog"` / `role="tooltip"`, the marker itself is considered to carry an explanation binding and satisfies the rule.

**Outcomes:**

- AI-marker present + affordance found → `info` (inventory, HAX G11 / PAIR cited in message)
- AI-marker present + no affordance found → `warning` (cross-condition gap)
- No AI-marker → no finding

## Scope

This rule implements only the **static "affordance present" slice** (Track 3.5). It does not check that an explainability indicator actually appears wherever AI output is rendered in a consuming application — that behavioral detection requires semantic location analysis and is deferred to Track 4.

## Examples

### Good — ExplainPopover co-located with AI-marker in the same file

```tsx
// AILabel.tsx — marker and affordance exported from the same file
export function AILabel() { return null; }
export function ExplainPopover() { return null; }
```

### Good — AI-marker with aria-describedby binding (popover in same file)

```tsx
// AILabel.tsx — marker opens an explanation panel
export function AILabel() {
  return (
    <>
      <button aria-describedby="why-panel">AI</button>
      <div id="why-panel" role="dialog">Why this was AI-generated: …</div>
    </>
  );
}
```

### Good — Confidence display co-located with AI-marker

```tsx
// AILabel.tsx — marker and confidence meter in the same component file
export function AILabel() { return null; }
export function ConfidenceDisplay() { return null; }
```

### Bad — affordance in a separate file from the AI-marker (no co-location)

```tsx
// AILabel.tsx
export const AILabel = () => null;

// ConfidenceDisplay.tsx — generic health metric, no AI marker in this file
export const ConfidenceDisplay = () => null;
```

→ Rule emits `warning`: AI-marker is present but no co-located explainability affordance was detected.

### Bad — AI-marker present, no affordance at all

```tsx
// AILabel.tsx — just the marker
export const AILabel = () => null;
```

→ Rule emits `warning`: AI-marker is present but no explainability affordance was detected.

### No finding — no AI surface

```ts
// src/index.ts — standard component surface, no AI marker or affordance
export { Button } from './button';
export { Card } from './card';
```

→ No finding. DS has no AI surface; rule is silent.

## Limitations

Detection is **static and name/co-location based**:

- An `info` finding means "an affordance component exists in the same file as an AI-marker component" — not "the affordance is wired to every AI output render site in consuming applications".
- A `ConfidenceDisplay` or `SourcesPanel` that lives in a file with no AI-marker identifier is **not credited**, even if it is conceptually related to AI output. This prevents false positives from generic health metrics or search-results panels whose names happen to match the affordance vocabulary.
- Behavioral verification — confirming the affordance actually appears wherever AI-generated content is rendered — is deferred to Track 4.

## Auto-fix

This rule has no auto-fix. Shipping an explainability affordance is a deliberate design decision that requires human authorship.

## Allowlist

This rule does not yet support a per-repo disable directive. If your DS satisfies the explainability requirement through a mechanism outside the recognised vocabulary (e.g. a `Rationale` or `AISummary` component), open an issue to request vocabulary expansion.

You can disable globally in `.lyse.yaml`:

```yaml
rules:
  ai-governance/explainability-affordance: off
```

## See also

- [`ai-governance/ai-marker-component-present`](./ai-governance-ai-marker-component-present.md) — Track 3.2; detects the AI-marker component that gates this rule. Exports `AI_MARKER_NAMES` reused here.
- [`ai-governance/ai-tokens-reserved`](./ai-governance-ai-tokens-reserved.md) — Track 3.1; inventories reserved AI-marker design tokens.
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
- Explainability guidelines by vendor (plain text — external sites may block link checkers): IBM Human-AI Experience Checklist G11 (Explain AI decisions); Google PAIR Explainability guidebook; Microsoft HAX Workbook guideline E1; Apple Human Interface Guidelines AI transparency principles.
