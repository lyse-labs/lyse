# `ai-governance/explainability-affordance`

> **Axis:** AI governance · **Severity:** warning (info when found) · **Auto-fixable:** no · **Version:** v1

Detect whether the design system ships a component or ARIA-binding that provides an explainability affordance alongside an AI-marker component. Part of Track 3.5 — Face B (AI-Governance). Guidelines: HAX G11 (Explain AI decisions) / PAIR Explainability.

## Why

Users interacting with AI-generated content have a right to understand why a particular output was produced. Design systems that ship an AI-marker component (Carbon `AILabel`, `AIBadge`, `GenAI*`, Polaris `magic-*`, etc.) but provide no companion explainability affordance leave consuming teams without a standard component to reach for. The result is ad-hoc implementations with inconsistent UX and missing accessibility attributes.

HAX G11 (IBM Human-AI Experience) and Google PAIR Explainability guidelines require that AI-powered interfaces expose an explanation pathway — a popover, citation list, confidence meter, or similar affordance — so users can evaluate trustworthiness and take informed action.

## How it works

The rule first checks whether an AI-marker component is present (using the shared `AI_MARKER_NAMES` vocabulary imported from `ai-governance/ai-marker-component-present`). If no AI-marker is found, the rule emits nothing — the DS has no AI surface.

When an AI-marker is detected, detection runs in two passes:

**Pass 1 — name-based scan.** The rule reads `src/index.ts`, `src/index.tsx`, `index.ts`, and `index.tsx` and extracts all exported identifiers. It also globs `**/*.{tsx,jsx,vue,ts}` (excluding `node_modules`, `dist`, `build`, `.git`, `.next`, `out`, `coverage`) and checks each file by file name and exported identifier. Any name that contains one of the following patterns (case-insensitive substring match) is treated as an explainability affordance:

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

### Good — ExplainPopover exported alongside AI-marker

```ts
// src/index.ts
export { AILabel } from './ai-label';
export { ExplainPopover } from './explain-popover';
export { Button } from './button';
```

### Good — AI-marker with aria-describedby binding

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

### Good — Confidence display component

```ts
// src/index.ts
export { AIBadge } from './ai-badge';
export { ConfidenceDisplay } from './confidence-display';
export { CitationList } from './citation-list';
```

### Bad — AI-marker present but no explainability affordance

```ts
// src/index.ts — AILabel exported but no Explain/Citation/Confidence companion
export { AILabel } from './ai-label';
export { Button } from './button';
export { Card } from './card';
```

→ Rule emits `warning`: AI-marker is present but no explainability affordance was detected.

### No finding — no AI surface

```ts
// src/index.ts — standard component surface, no AI marker or affordance
export { Button } from './button';
export { Card } from './card';
```

→ No finding. DS has no AI surface; rule is silent.

## Auto-fix

This rule has no auto-fix. Shipping an explainability affordance is a deliberate design decision that requires human authorship.

## Allowlist

Add to your `README.md` or `.lyse.yaml`:

```
lyse-disable ai-governance/explainability-affordance
```

Use when:
- Your DS satisfies the explainability requirement through a component outside the recognised vocabulary (e.g. a `Rationale` or `AISummary` component) — open an issue to request vocabulary expansion, then allowlist in the interim.
- The explainability affordance lives in a separate package not visible to Lyse's scan root.

You can also disable globally via the rules config in `.lyse.yaml`:

```yaml
rules:
  ai-governance/explainability-affordance: off
```

## See also

- [`ai-governance/ai-marker-component-present`](./ai-governance-ai-marker-component-present.md) — Track 3.2; detects the AI-marker component that gates this rule. Exports `AI_MARKER_NAMES` reused here.
- [`ai-governance/ai-tokens-reserved`](./ai-governance-ai-tokens-reserved.md) — Track 3.1; inventories reserved AI-marker design tokens.
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
- Explainability guidelines by vendor (plain text — external sites may block link checkers): IBM Human-AI Experience Checklist G11 (Explain AI decisions); Google PAIR Explainability guidebook; Microsoft HAX Workbook guideline E1; Apple Human Interface Guidelines AI transparency principles.
