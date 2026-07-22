# `tokens/no-hardcoded-typography`

> **Axis:** Tokens · **Severity:** warning · **Auto-fixable:** no · **Status:** stable (scored)

Flags hardcoded `font-size`, `font-weight`, and `letter-spacing` values that don't come from a typography token scale.

## Why

A type scale (`--font-size-sm/md/lg`, `--font-weight-regular/semibold`) is the backbone of a design system's voice. Ad-hoc `font-size: 13px` / `font-weight: 650` scattered per component erode that scale into dozens of near-duplicates.

## How

Scans CSS / CSS-in-JS for three properties and checks them against `ctx.tokens.typography` (with `weight/` and `letter-spacing/` prefixed keys). Exemptions keep precision high:

- **`font-size`** — only px/rem/em are checked; percentages and keywords (`larger`, `medium`, …) are exempt.
- **`font-weight`** — the canonical `400`/`700` and all keywords (`normal`, `bold`, …) are exempt; other off-scale numerics are flagged.
- **`letter-spacing`** — `0` and `normal` are exempt.
- **`var(...)`** is always exempt.

**`line-height` is intentionally out of scope** — unitless line-heights (`1.4`, `1.5`) are pervasive and rarely tokenized, so flagging them is noise rather than signal.

## How the value is resolved

On a full `lyse audit`, every typography literal is resolved against the repo's own typography tokens, derived from the Design System Graph (Tailwind config, `*.tokens.json`, CSS custom properties, SCSS variables). Typography is treated as a **composite** axis: font-size, font-weight and letter-spacing are each a single scalar, but they are not comparable to one another on one numeric line (`13px`, `650` and `0.4px` share no unit), so the comparison is normalized string equality on the prefixed scale key and the `near` band is structurally unreachable.

| Class | Meaning | What this rule emits |
|---|---|---|
| `exact` | Normalized string match against a typography token | nothing — this is compliant usage, not drift |
| `near` | — | structurally unreachable on a composite axis |
| `novel` | No typography token matches | **warning** |
| `unresolved` | Not judgeable statically (`var(--x)`, a SCSS `$var`, a CSS-wide keyword) | nothing — counted in the audit's `meta.abstentions` |

`novel` emits **warning**, not `info`. The `info` downgrade is only defensible where a `near` band exists to absorb the "one step off, probably a typo" case. With no `near` band here, `novel` collapses "one step off the type scale" and "a value unrelated to anything" into a single class; grading that whole class `info` would under-report the first, which is genuine drift and exactly what the pre-migration rule reported as `warning`.

Because the comparison is string equality rather than the numeric path, the 16px-root normalization that lets the length-valued axes (spacing, radii, border widths, breakpoints) compare px against rem does **not** apply here: a `font-size: 16px` literal does not match a `1rem` font-size token.

Because a composite axis has no candidate token to name, the suggestion is the same fixed remediation hint on both the resolver and the legacy path.

The resolver only exists on a full `lyse audit`. Single-file surfaces — MCP `audit_file`, IDE contexts, codemod contexts — have no repo-wide scale and keep the pre-migration behaviour: an exact-match token lookup and an unconditional `warning`.

## Bad

```css
.label { font-size: 13px; font-weight: 650; }
```

## Good

```css
:root { --font-size-sm: 13px; --font-weight-semibold: 600; }
.label { font-size: var(--font-size-sm); font-weight: var(--font-weight-semibold); }
```

## Allowlist

```
lyse-disable tokens/no-hardcoded-typography
```

## Status

Value-drift rule — **stable** and **scored**: it contributes to the Health Score.

## See also

- [Health Score](../guide/health-score.md)

## Reliability

<!-- reliability:auto:start -->
- novel · app: not measured
<!-- reliability:auto:end -->
