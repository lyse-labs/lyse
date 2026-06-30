# `ai-governance/ai-marker-component-present`

> **Axis:** AI governance · **Severity:** warning (info when found) · **Auto-fixable:** no · **Version:** v1

Detect whether the design system ships a dedicated AI-marker component — a label, badge, avatar, or indicator that visually marks AI-generated output. Part of Track 3 — Face B (AI-Governance).

## Why

AI-marker components are the visual contract between the design system and its consumers. They answer the question: "is this content AI-generated?" Without a dedicated component, individual teams invent ad-hoc markers — inconsistent styling, missing accessibility attributes, no design-system ownership.

The most actionable case is a DS that has already shipped reserved AI tokens (Carbon `dragon-fruit`, Polaris `magic`, Workday Canvas `*-ai-*`) but provides no corresponding component for consumers to apply. That mismatch is the `warning` finding: tokens signal AI-surface intent but there is nothing to put in the UI.

When a marker component is found, the rule emits an `info` finding to inventory it — feeding the Track 3.3 composite rule. A DS with no AI surface at all (no reserved tokens, no marker component) emits nothing and is not penalised.

## How it works

Detection runs in two passes:

**Pass 1 — export surface.** The rule reads `src/index.ts`, `src/index.tsx`, `index.ts`, and `index.tsx` and extracts all exported identifiers (named declarations, named re-exports, aliased re-exports). Any identifier matching the marker vocabulary is recorded.

**Pass 2 — component files.** The rule globs `**/*.{tsx,jsx,vue}` (excluding `node_modules`, `dist`, `build`, `.git`, `.next`, `out`, `coverage`). Each file is checked:
1. By file name — `AILabel.tsx` → `AILabel` is a candidate.
2. By exported identifiers in the source (same extraction as pass 1).
3. For Vue SFCs, by the `name: 'AILabel'` component option.

**Vocabulary (case-insensitive, `AI_MARKER_NAMES` exported for siblings):**

| Pattern | Examples |
|---|---|
| `AILabel` (exact) | `AILabel`, `ailabel` |
| `AIBadge` / `AITag` / `AIIndicator` / `AIAvatar` / `AIMarker` | `AIBadge`, `AiTag` |
| `GenAI*` prefix | `GenAIAvatar`, `GenAILabel` |
| `*AIMarker*` substring | `MyAIMarkerBadge` |
| `magic-*` prefix (Polaris) | `magic-icon`, `magic-sparkle` |
| Structural word + locale AI noun (Track 9.1) | `BadgeIA`, `IALabel`, `KIBadge`, `人工知能Badge` |

**Localized markers (Track 9.1).** An identifier also counts as an AI marker when it combines a structural marker word (`label`, `badge`, `tag`, `indicator`, `marker`, `avatar`, `chip`, `pill` — code-identifier vocabulary, kept in English even in localized products) with an AI noun from any active locale (`ai`, `ia`, `ki`, `人工知能`, plus `.lyse.yaml` `i18n.vocabulary.aiNouns`). Latin nouns are boundary-delimited so `ai` never matches inside `Email`, `Detail`, or `Caption`; a structural word alone (`Badge`) never matches.

**Cross-condition warning.** If no marker component is found but `detectReservedAiTokens(repoRoot)` (shared parser from `packages/core/src/parsers/ai-tokens.ts`) returns a non-empty list, the rule emits a `warning`. This is the "tokens without a component" gap.

Results are deduplicated (case-insensitive key) and sorted alphabetically (deterministic output).

## Examples

### Good — AI-marker component exported

```ts
// src/index.ts
export { AILabel } from './ai-label';
export { Button } from './button';
export { Card } from './card';
```

```tsx
// src/components/AILabel.tsx
export function AILabel({ children }: { children: React.ReactNode }) {
  return <span role="img" aria-label="AI-generated">{children}</span>;
}
```

```tsx
// Polaris-style: magic-icon.tsx detected by file name
export const MagicIcon = () => <svg aria-label="AI" />;
```

### Bad — reserved tokens present but no marker component

```json
// tokens.json — Workday Canvas-style AI tokens
{ "color": { "ai": { "primary": "#0875e1", "secondary": "#005cb9" } } }
```

```ts
// src/index.ts — no AILabel, AIBadge, or magic-* component exported
export { Button } from './button';
export { Card } from './card';
```

→ Rule emits `warning`: reserved AI tokens are present (2 found) but no AI-marker component was detected.

### Good — no AI surface (no finding)

```json
// tokens.json — plain brand tokens, no AI vocabulary
{ "color": { "primary": "#0070f3", "background": "#ffffff" } }
```

```ts
// src/index.ts — standard component surface, no AI marker
export { Button } from './button';
export { Card } from './card';
```

→ No finding. DS has no AI surface; rule is silent.

## Auto-fix

This rule has no auto-fix. It is a detection rule — the presence or absence of an AI-marker component is a deliberate design decision that requires human authorship.

## Allowlist

If your DS uses a marker component name outside the recognised vocabulary, or if the AI-marker role is served by a differently named component, add the disable directive to your repo root README or `.lyse.yaml`:

```md
<!-- lyse-disable ai-governance/ai-marker-component-present -->
```

```yaml
# .lyse.yaml
# lyse-disable ai-governance/ai-marker-component-present
```

The directive is matched by substring — any line in `README.md` / `README.mdx` / `readme.md` / `.lyse.yaml` / `.lyse.yml` containing the literal string `lyse-disable ai-governance/ai-marker-component-present` suppresses the rule.

You can also disable globally in `.lyse.yaml`:

```yaml
rules:
  ai-governance/ai-marker-component-present: off
```

## See also

- [Health Score](../guide/health-score.md) — how rules combine into the final score.
- AI-marker component vocabularies by DS vendor (plain text — external sites may block link checkers): Carbon Design System `AILabel`; Shopify Polaris `magic-*` components; Workday Canvas AI-flagged components; SAP Horizon AI indicator patterns; Microsoft Fluent AI badge components.
