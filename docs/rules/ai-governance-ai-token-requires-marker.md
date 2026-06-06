# `ai-governance/ai-token-requires-marker`

> **Axis:** AI governance · **Severity:** error · **Auto-fixable:** no · **Version:** v1

IBM Carbon mandatory composite: every component file that references a reserved AI design token must co-locate an AI-marker component or an explicit `data-ai` attribute. Token usage without a visible AI-provenance cue is an `error`. Part of Track 3 — Face B (AI-Governance).

## Why

IBM Carbon's AI design system mandates the composite pairing: a component consumes an AI-marker token for visual styling **and** renders a labelling component (AILabel, AIBadge, etc.) so the AI provenance is legible to users. Without this pairing, the token is applied silently — the UI is styled as "AI-produced" but carries no transparency cue.

This is not a stylistic concern. As design systems increasingly ship AI surface tokens (Carbon `dragon-fruit` gradients, Polaris `magic` palette, Workday Canvas `*-ai-*` colors), the absence of a paired disclosure marker is a correctness bug — it breaks Carbon's own specification and runs ahead of emerging expectations around AI disclosure in UIs.

The rule emits `error` (not `warning`) because the composite is binary: both halves are present (correct) or one is missing (incorrect). Confidence is HIGH only when token detection is unambiguous (via `var(--…)` or bare `--token` references); dot-path heuristic hits are LOW-confidence and suppressed by default.

## How it works

```
for each *.tsx / *.jsx / *.vue component file:
  1. fast-exit if detectReservedAiTokens(repoRoot) returns [] (no AI surface)
  2. scan for reserved token usage: var(--ai-*), --p-color-*-magic*, dragon-fruit, etc.
  3. if none found → pass (no finding)
  4. scan for AI-marker: JSX tag in AI_MARKER_NAMES, magic-* prefix, or data-ai attribute
  5. if marker found → pass
  6. classify confidence: HIGH if token is via var(--…) or bare --token; LOW if dot-path only
  7. if confidence LOW → suppress (no finding)
  8. emit error
```

Token detection reuses the shared parser:

```ts
import { detectReservedAiTokens } from "@lyse-labs/lyse/parsers/ai-tokens";
const reserved: string[] = detectReservedAiTokens(repoRoot);
```

Marker detection reuses the shared vocabulary:

```ts
import { AI_MARKER_NAMES, isAiMarkerName } from "./ai-governance-ai-marker-component-present.js";
```

Neither list is redefined in this rule — single source of truth.

### Recognised AI token patterns (per-file detection)

| Form | Example | Confidence |
|---|---|---|
| `var(--ai-*)` | `var(--ai-surface)` | HIGH |
| `var(--p-color-*-magic*)` | `var(--p-color-bg-magic)` | HIGH |
| bare `--token` reference | `--ai-accent` in template literal | HIGH |
| dot-path | `tokens.color.ai.primary` | LOW (suppressed) |

### Recognised AI-marker forms

| Form | Example |
|---|---|
| JSX tag in `AI_MARKER_NAMES` | `<AILabel>`, `<AIBadge>`, `<AITag>`, `<GenAIAvatar>` |
| Polaris `magic-*` JSX tag | `<magic-icon />` |
| `genai` prefix JSX | `<GenAIOutput />` |
| `data-ai` attribute | `<div data-ai …>` |

## Examples

### Good — token + AILabel

```tsx
// AICard.tsx
import { AILabel } from './ai-label';

const AICard = () => (
  <div style={{ background: 'var(--ai-gradient)' }}>
    <AILabel>AI-generated</AILabel>
    {content}
  </div>
);
```

### Good — data-ai explicit annotation

```tsx
// Answer.tsx
const Answer = () => (
  <div data-ai style={{ background: 'var(--p-color-bg-magic)' }}>
    {aiAnswer}
  </div>
);
```

### Good — no AI token → no requirement

```tsx
// Card.tsx — uses no reserved AI token, marker not required
const Card = () => (
  <div style={{ color: 'var(--color-primary)' }}>{content}</div>
);
```

### Bad — token without marker

```tsx
// AICard.tsx — FAILS: var(--ai-gradient) used, no AILabel/AIBadge/data-ai present
const AICard = () => (
  <div style={{ background: 'var(--ai-gradient)' }}>
    {content}
  </div>
);
```

```vue
<!-- AIAssistant.vue — FAILS: --ai-surface used, no marker co-located -->
<template>
  <div :style="{ background: 'var(--ai-surface)' }">{{ answer }}</div>
</template>
```

## Auto-fix

No auto-fix. Adding an AI-marker requires product intent — the correct marker type (label, badge, avatar, indicator) and its content depend on context that a codemod cannot reliably infer.

## Confidence and suppression

Findings are only emitted at HIGH confidence. A detection is HIGH when the token reference is in `var(--…)` or bare `--token` form — unambiguous CSS-variable usage. If the only evidence is a dot-path expression (`tokens.color.ai.primary`), confidence is LOW and the finding is suppressed by default (the dot-path may be a variable name coincidence, not a real token consumption).

To surface LOW-confidence findings (not recommended for CI gates):

```bash
lyse audit --min-confidence low
```

## Allowlist

This rule is a no-op when no reserved AI tokens are declared anywhere in the repository. No configuration or disable directive is needed for DS repos with no AI surface.

If a specific file uses a non-AI `--ai-*` CSS variable (naming collision), move the variable to a non-reserved name, or scope the exception at the file level via a comment (not yet supported — planned for v0.2).

## See also

- `ai-governance/ai-tokens-reserved` — Track 3.1 inventory rule that surfaces which reserved tokens the repo declares; the present rule consumes that list via `detectReservedAiTokens`.
- `ai-governance/ai-marker-component-present` — Track 3.2 rule that checks whether the DS ships a dedicated AI-marker component at all; exports `AI_MARKER_NAMES` shared by this rule.
- IBM Carbon for AI design guidelines (carbondesignsystem.com)
- Shopify Polaris magic token palette (polaris.shopify.com)
- Workday Canvas AI token vocabulary (canvas.workday.com)
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
