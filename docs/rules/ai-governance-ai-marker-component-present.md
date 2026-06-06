# `ai-governance/ai-marker-component-present`

> **Axis:** AI governance · **Severity:** info (marker found) / warning (tokens present, no marker) · **Auto-fixable:** no · **Version:** v1

Detects whether the design system ships an AI-marker component — a dedicated label, badge, avatar, or indicator that visually identifies AI-generated output. Part of Track 3.2 — Face B (AI-Governance).

## Why

AI-generated output that is indistinguishable from human-authored content violates emerging AI transparency requirements (EU AI Act recital 50, NIST AI RMF) and erodes user trust. A design system that ships AI-branded tokens or AI features but no dedicated marker component forces every product team to invent their own disclosure pattern — creating fragmentation and inconsistency.

The rule detects this gap early, before the DS is consumed by dozens of product teams. When a marker is present it reports an `info` finding (positive confirmation) rather than staying silent, giving auditors a machine-readable signal without requiring manual inspection. The secondary `warning` — reserved AI tokens present but no marker component — catches the most dangerous scenario: a DS that has begun an AI design language but hasn't closed the loop with a visual disclosure component.

## How it works

The rule scans two surfaces:

1. **Export surface** — `src/index.ts`, `src/index.tsx`, `index.ts`, `index.tsx` (checked in order). Named exports and function declarations are matched against the AI-marker vocabulary. Star re-exports (`export * from ...`) are treated as opaque marker presence — the rule cannot follow the chain without a full resolver, so it does not warn.

2. **Component file names** — `**/*.{tsx,jsx,vue}` (excluding `node_modules`, test, spec, and stories files). The file's base name (without extension) is matched against the vocabulary.

### AI-marker vocabulary

| Pattern | Examples |
|---|---|
| Carbon / generic | `AILabel`, `AiLabel` |
| Generic badge/tag | `AIBadge`, `AITag`, `AIIndicator` |
| Generic marker/avatar | `AIMarker`, `AIAvatar`, `GenAIAvatar` |
| GenAI prefixed | `GenAILabel`, `GenAIBadge`, `GenAITag` |
| Polaris magic-* | any component name starting with `magic-` |

### Cross-condition warning

When no marker component is found, the rule performs a conservative scan for reserved AI token names in token files (`**/*.tokens.json`, `**/tokens/**/*.json`, `**/*.css`, `**/*.scss`). Patterns include `\bai\b`, `-ai-`, `--p-color-*-magic*`, and `dragon-fruit`. If any match is found, a `warning` is emitted.

## Examples

### Good — AILabel exported

```ts
// src/index.ts
export { AILabel } from './ai-label';
export { GenAIAvatar } from './gen-ai-avatar';
export { Button } from './button';
```

Finding: `info` — `'AILabel'` detected, design system marks AI-generated output.

### Good — Polaris magic-* component

```tsx
// components/magic-button.tsx
export function MagicButton() { /* ... */ }
```

Finding: `info` — `'magic-button'` detected.

### Bad — tokens without marker

```json
// tokens/ai.tokens.json
{ "--color-ai-primary": "#0050E6" }
```

```ts
// index.ts — no AI-marker component exported
export { Button } from './button';
export { Card } from './card';
```

Finding: `warning` — Reserved AI tokens are present but no AI-marker component is exported.

### No finding — no AI surface

```ts
// index.ts — purely non-AI DS
export { Button } from './button';
export { Input } from './input';
```

No AI tokens, no marker component → rule is N/A, no finding emitted.

## Auto-fix

Not applicable. Shipping an AI-marker component requires a design decision and implementation that cannot be automated.

## Allowlist

If your DS legitimately should not ship an AI-marker component (e.g. a token-only primitives library), add the disable directive to your repo root README:

```md
<!-- lyse-disable ai-governance/ai-marker-component-present -->
```

The directive is matched by substring anywhere in `README.md`, `README`, `readme.md`, or `README.mdx`.

You can also disable the rule globally in `.lyse.yaml`:

```yaml
rules:
  ai-governance/ai-marker-component-present: off
```

## See also

- [`ai-governance/ai-marker-component-present`](https://github.com/lyse-labs/lyse/blob/main/docs/rules/ai-governance-ai-marker-component-present.md) — this rule
- [Carbon AILabel](https://carbondesignsystem.com/components/AI-label/usage/) — the canonical L1 AI-marker component
- [Polaris magic components](https://polaris.shopify.com/components) — Shopify's AI disclosure pattern
- [EU AI Act recital 50](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689) — AI transparency obligations
- [NIST AI RMF](https://airc.nist.gov/Risk_and_Impacts) — risk management framework
- [Health Score](../guide/health-score.md) — how rules combine into the final score
