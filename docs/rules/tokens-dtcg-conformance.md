# `tokens/dtcg-conformance`

> **Axis:** Tokens · **Severity:** warning (some sub-checks error) · **Auto-fixable:** no · **Version:** v2

Strict validation of design-token JSON files against the W3C Design Tokens
Community Group draft (DTCG). Each leaf token is checked for `$value`
presence, `$type` declaration, alias resolution, and type-specific value
shape (color must be a CSS color, dimension must carry a unit, fontWeight
must fall in `[1, 1000]`, and so on).

## Why

DTCG conformance is the contract between design and code. Non-conformant
token files don't survive round-trips through Style Dictionary, Tokens
Studio, or Figma Tokens plugins — they silently corrupt theming and break
dark-mode propagation. They also degrade the AI-consumable surface of the
design system: an MCP server or coding agent can't reliably reason about a
token whose declared `$type` doesn't match its `$value`.

The most common drift modes:

- Tokens with `$value` but no `$type` — Style Dictionary cannot pick the
  right transform; the token round-trips as a raw string.
- Aliases (`{color.brand}`) that point at renamed or deleted paths after a
  refactor — silently produces a CSS `undefined` at build time.
- `$type` claims `color` but `$value` is a typo (`"blu"`).
- `$type` claims `dimension` but `$value` is unit-less (`"16"`), which
  some tools coerce to `px` and others reject outright.
- Composite shadow tokens written as legacy strings (`"0 1px 2px black"`)
  instead of objects.

## How

The rule walks every file matching `*.tokens.json`, `tokens/**/*.json`,
or `**/tokens/**/*.json` under the repo root (size-capped at 1 MB). For
each leaf token it emits up to one finding per check:

| Sub-check | Severity | Trigger |
|---|---|---|
| Missing `$type` | warning | Token has `$value` but no `$type` and inherits none from a group. |
| Broken alias | error | `$value: "{group.name}"` does not resolve in the same document. |
| `color` value invalid | error | `$type: "color"` but `$value` is not a hex / `rgb()` / `hsl()` / `oklch()` / named color. |
| `dimension` value invalid | error | `$type: "dimension"` but `$value` lacks a CSS unit. |
| `fontFamily` value invalid | error | `$type: "fontFamily"` but `$value` is not a non-empty string or array of strings. |
| `fontWeight` value invalid | error | `$type: "fontWeight"` but `$value` is outside `[1, 1000]` and not a named weight. |
| `duration` value invalid | error | `$type: "duration"` but `$value` is not `<number>(ms|s)`. |
| `cubicBezier` value invalid | error | `$type: "cubicBezier"` but `$value` is not a 4-number array, named easing, or `cubic-bezier()` expression. |
| `number` value invalid | error | `$type: "number"` but `$value` is not a finite number. |
| Composite shape wrong | warning | `$type: "shadow"|"typography"|"border"|"transition"|"gradient"` but `$value` shape is malformed. |
| Group/token `$type` conflict | warning | Token declares a `$type` different from its enclosing group's `$type`. |

The rule does **not** check for `$description` per leaf — that surface is
owned by [`tokens/description-coverage`](./tokens-description-coverage.md),
which targets the semantic layer where descriptions actually matter.

## Examples

### Good

```json
{
  "color": {
    "brand":  { "$type": "color",     "$value": "#2563eb" },
    "accent": { "$type": "color",     "$value": "{color.brand}" }
  },
  "spacing":   { "sm":      { "$type": "dimension",   "$value": "8px"  } },
  "duration":  { "fast":    { "$type": "duration",    "$value": "200ms" } },
  "easing":    { "standard":{ "$type": "cubicBezier", "$value": [0.4, 0, 0.2, 1] } },
  "fontWeight":{ "regular": { "$type": "fontWeight",  "$value": 400 } },
  "shadow": {
    "sm": {
      "$type": "shadow",
      "$value": { "offsetX": "0", "offsetY": "1px", "blur": "2px", "color": "rgba(0,0,0,0.1)" }
    }
  }
}
```

### Bad

```json
{
  "color":    { "brand":   { "$value": "#2563eb" } },                              // missing $type
  "spacing":  { "sm":      { "$type": "dimension",  "$value": "16" } },            // dimension lacks unit
  "accent":   { "primary": { "$type": "color",      "$value": "{color.brandd}" } },// broken alias (typo)
  "weight":   { "bold":    { "$type": "fontWeight", "$value": 1234 } },            // out of [1,1000]
  "duration": { "fast":    { "$type": "duration",   "$value": "200" } },           // duration without unit
  "shadow":   { "sm":      { "$type": "shadow",     "$value": "0 1px 2px black" } } // shadow as string
}
```

## Auto-fix

This rule has no codemod. The required edits are too varied (rewriting
shadow strings into objects, choosing the right unit, picking a hex for
the intended color) to apply automatically without a high risk of bad
guesses.

Use `lyse explain tokens/dtcg-conformance` for a per-finding explanation
and copy-pasteable JSON snippets.

## Allowlist

Three escape hatches, in order of preference:

**1. Per-token, inline.** Use the standard DTCG `$extensions` field — this
travels with the token through any tooling chain that respects the spec:

```json
{
  "color": {
    "legacy": {
      "$type": "color",
      "$value": "blu",
      "$extensions": { "lyse": { "disable": ["tokens/dtcg-conformance"] } }
    }
  }
}
```

Use `"all"` instead of the rule ID to disable every Lyse check on the
token. The escape hatch is intended for the long tail of vendor-imported
tokens that you do not own, not for hiding fresh drift.

**2. File-level.** Exclude whole files in `.lyse.yaml`:

```yaml
designSystem:
  excludePaths:
    - "fixtures/**/*.tokens.json"
    - "vendor/figma-export.tokens.json"
```

**3. Whole-rule.** Disable the rule entirely in `.lyse.yaml`:

```yaml
rules:
  tokens/dtcg-conformance: off
```

Disabled rules contribute no findings and have no effect on the tokens
axis score.

## See also

- [`tokens/description-coverage`](./tokens-description-coverage.md) —
  measures `$description` coverage on the semantic token layer.
- [`tokens/no-hardcoded-color`](./tokens-no-hardcoded-color.md) — flags
  hardcoded colors in UI code (the other end of the token contract).
- [W3C Design Tokens Community Group draft](https://design-tokens.github.io/community-group/format/)
  — the source spec this rule enforces.
- [Health Score](../guide/health-score.md) — how rules combine into the
  final score.
