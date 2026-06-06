# `ai-governance/ai-tokens-reserved`

> **Axis:** AI governance · **Severity:** info · **Auto-fixable:** no · **Version:** v1

Scans the design-system token layer for reserved AI-marker token names and emits a single `info` finding listing them. This is the inventory foundation consumed by Track 3.3 (`ai-governance/ai-token-requires-marker`).

## Why

Design systems in 2026 increasingly ship a dedicated AI-styled surface — tokens that encode the brand's AI interaction palette. Examples: Carbon's `dragon-fruit` gradient family, Polaris's `magic` namespace, Workday Canvas's `*-ai-*` segment. These tokens are reserved: they must not be used outside sanctioned AI components.

Before enforcing use-site constraints, the toolchain needs to know which reserved AI tokens actually exist in the DS. This rule provides that inventory. Presence is informational (the DS has an AI surface); absence is neutral (no AI surface yet). No DS is penalized for missing AI tokens — the enforcement teeth live in the downstream rule.

## How

The rule scans three source types at the repo root:

- **JSON token files**: `tokens.json`, `tokens/**/*.json`, `**/*.tokens.json` — keys at any depth are checked against reserved patterns.
- **YAML token files**: `tokens.yaml`, `tokens/**/*.yaml`, `**/*.tokens.yaml` — same key extraction.
- **CSS files**: `**/*.css` — `--custom-property` declaration names are extracted and checked.

Reserved patterns (case-insensitive):

| Pattern | DS origin |
|---|---|
| Token name contains `-ai-` segment, starts with `ai-`, or ends with `-ai` | Workday Canvas, generic |
| Token name contains `magic` | Shopify Polaris |
| Token name contains `dragon-fruit` or `dragonfruit` | IBM Carbon AI gradient |

## Examples

**Good (info emitted — tokens catalogued):**

```json
{
  "color-ai-brand": { "$value": "#8a3ffc", "$type": "color" },
  "dragon-fruit-01": { "$value": "#ff7eb6", "$type": "color" }
}
```

```css
:root {
  --p-color-text-magic: #8a3ffc;
  --p-color-bg-magic-secondary: #f0e6ff;
}
```

**Neutral (no finding emitted — no AI surface):**

```json
{
  "color-primary": { "$value": "#0f62fe" },
  "color-secondary": { "$value": "#393939" },
  "spacing-sm": { "$value": "4px" }
}
```

## Auto-fix

Not applicable. This rule is informational — it catalogs tokens for downstream consumption. No automated transformation is warranted.

## Allowlist

To silence the rule for a repo where the AI-token presence is intentional and already governed elsewhere, add the disable directive to `README.md` or `.lyse.yaml`:

```md
<!-- lyse-disable ai-governance/ai-tokens-reserved -->
```

```yaml
# lyse-disable ai-governance/ai-tokens-reserved
```

The directive is a substring match — it can appear anywhere in the file.

Additional exclusions:

- Token or CSS files larger than 2 MB are skipped automatically.
- The rule is a no-op when `repoRoot` is not set (e.g., in isolated unit-test contexts).

## See also

- [`ai-governance/ai-token-requires-marker`](./ai-governance-ai-token-requires-marker.md) — Track 3.3, the enforcement rule that consumes this inventory.
- [IBM Carbon for AI tokens](https://carbondesignsystem.com/elements/color/tokens/) — dragon-fruit gradient reference.
- [Shopify Polaris magic tokens](https://polaris.shopify.com/tokens/color) — magic namespace reference.
- [Workday Canvas tokens](https://canvas.workday.com/tokens/color) — `*-ai-*` segment reference.
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
