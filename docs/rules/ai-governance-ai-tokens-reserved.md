# `ai-governance/ai-tokens-reserved`

> **Axis:** AI governance · **Severity:** info · **Auto-fixable:** no · **Version:** v1

Inventory the reserved AI-marker design tokens declared by a repository. Part of Track 3 — Face B (AI-Governance). This rule is the foundation that the composite gating rule `ai-governance/ai-token-requires-marker` (Track 3.3) consumes — it surfaces *which* tokens exist; 3.3 enforces *where* they must be used.

## Why

AI-marker tokens tell consumers — humans and agents — that a UI region was produced by AI. The three established vocabularies plus a generic long tail are:

| Vocabulary | Pattern | Example |
|---|---|---|
| IBM Carbon | `dragon-fruit` / `dragonfruit` | `gradient.dragon-fruit` |
| IBM Carbon | `*-ai-*` color segment | `color.background.ai.primary` |
| Shopify Polaris | `--p-color-*-magic*` (CSS) | `--p-color-bg-magic-hover` |
| Workday Canvas | `*-ai-*` segment | `color.ai.primary` |
| Generic | leading / trailing / mid `ai` segment | `--ai-accent`, `color.ai` |

A DS with **no** AI tokens is not penalised here — the score is unchanged, and no finding is emitted. The teeth live in Track 3.3, which checks that AI-produced surfaces actually wear an AI marker token. This rule's job is to give 3.3 a deterministic, reusable token-name list.

## How it works

The rule delegates to a pure shared helper:

```ts
import { detectReservedAiTokens } from "@lyse-labs/lyse/parsers/ai-tokens";
const reserved: string[] = detectReservedAiTokens(repoRoot);
```

`detectReservedAiTokens(repoRoot)` walks:

- JSON token files: `tokens.json`, `tokens/**/*.json`, `*.tokens.json` (incl. nested monorepo paths).
- CSS files: `**/*.css` — every `--token-name:` declaration.
- SCSS files: `**/*.scss` — both the post-transform `--*` custom properties **and** the raw `$variable` identifiers (declarations like `$ai-aura-end: …` and namespaced usages like `theme.$ai-aura-start-sm`). This matters because SCSS-authored design systems compile their AI tokens away from source: IBM Carbon authors `theme.$ai-*` (the `--cds-ai-*` names exist only in compiled CSS), and AWS Cloudscape ships `$*-gen-ai`. Without scanning the raw `$variable` source these would be invisible to a source scan (#139).

`node_modules`, `dist`, `build`, `.git`, `.next`, `out`, `coverage` are excluded. Token-name matching is **segment-anchored**: each name is split on `-`, `_`, `.`, `/`, whitespace, and the segments are compared against the reserved set. This is why `rain`, `paint`, `mainColor`, `captain`, `detail` do not match — `ai` only triggers when it is a whole segment, not a substring of a larger word.

Results are deduplicated and sorted alphabetically (deterministic output — same input → same finding).

When the result is non-empty, a single `info` finding is emitted listing up to 20 names, with a `+N more` suffix when truncated. When the result is empty, no finding is emitted.

## Examples

### Good (no reserved AI tokens)

```json
// tokens.json
{
  "color": {
    "primary": { "value": "#0070f3" },
    "background": { "value": "#ffffff" }
  }
}
```

```css
/* theme.css */
:root {
  --color-primary: #0070f3;
  --color-background: #ffffff;
}
```

### Bad (reserved AI tokens present — informational finding)

```json
// tokens.json — Workday Canvas / Carbon-style
{ "color": { "ai": { "primary": "#0875e1", "secondary": "#005cb9" } } }
```

```json
// tokens.json — Carbon AI gradient
{ "gradient": { "dragon-fruit": "linear-gradient(...)" } }
```

```css
/* polaris.css */
:root {
  --p-color-bg-magic: #f4f0fd;
  --p-color-bg-magic-hover: #ebe3fc;
}
```

```css
/* ai-tokens.css — generic */
:root { --ai-primary: #abc; --ai-accent: #def; }
```

## Auto-fix

This rule has no auto-fix. It is an **inventory rule** — the matched names are surfaced so the downstream composite rule (`ai-governance/ai-token-requires-marker`) can act on them. There is no "fix" to apply at the inventory step.

## Allowlist

If your DS legitimately ships tokens whose names collide with the reserved vocabularies (e.g. a `magic` namespace unrelated to Polaris's AI tokens), add the disable directive to your repo root README or `.lyse.yaml`:

```md
<!-- lyse-disable ai-governance/ai-tokens-reserved -->
```

```yaml
# .lyse.yaml
# lyse-disable ai-governance/ai-tokens-reserved
```

The directive is matched by substring — any line in `README.md` / `README.mdx` / `readme.md` / `.lyse.yaml` / `.lyse.yml` containing the literal string `lyse-disable ai-governance/ai-tokens-reserved` will suppress the rule.

You can also disable the rule globally in `.lyse.yaml` via the rules block (same convention as every other rule):

```yaml
rules:
  ai-governance/ai-tokens-reserved: off
```

## See also

- `ai-governance/ai-token-requires-marker` — Track 3.3 composite gating rule that consumes the list returned here (doc lands with that rule).
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
- [Carbon for AI tokens](https://carbondesignsystem.com/) · [Shopify Polaris `magic`](https://polaris.shopify.com/tokens/color) · [Workday Canvas](https://canvas.workday.com/).
