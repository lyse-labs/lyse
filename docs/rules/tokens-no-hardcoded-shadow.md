# `tokens/no-hardcoded-shadow`

> **Axis:** Tokens · **Severity:** warning · **Auto-fixable:** no · **Status:** experimental (reported-only, not yet scored)

Flags hardcoded `box-shadow` values that don't come from a shadow token scale.

## Why

Elevation is a system-level language: a handful of named shadows (`--shadow-sm/md/lg`) communicate depth consistently. Hand-rolled `box-shadow` values per component drift into a dozen near-identical-but-not blurs and opacities.

## How

Scans CSS / CSS-in-JS for `box-shadow` declarations. Keyword values (`none`, `inherit`, …) and tokenized references (`var(--shadow-*)`) are exempt. When a shadow scale is loaded (`ctx.tokens.shadows`), values matching a token (whitespace-insensitive) are compliant; everything else is flagged. The full declaration value is treated as one unit — a shadow is a composite token, not per-length drift.

## How the value is resolved

On a full `lyse audit`, every `box-shadow` literal is resolved against the repo's own shadow tokens, derived from the Design System Graph (Tailwind config, `*.tokens.json`, CSS custom properties, SCSS variables). Shadows are a **composite** axis: a tuple of offsets, blur, spread and colour has no defensible single-scalar distance, so the comparison is normalized string equality (lowercased, whitespace-collapsed) and the `near` band is structurally unreachable.

| Class | Meaning | What this rule emits |
|---|---|---|
| `exact` | Normalized string match against a shadow token | nothing — this is compliant usage, not drift |
| `near` | — | structurally unreachable on a composite axis |
| `novel` | No shadow token matches | **warning** |
| `unresolved` | Not judgeable statically (`var(--x)`, a SCSS `$var`, a CSS-wide keyword) | nothing — counted in the audit's `meta.abstentions` |

`novel` emits **warning**, not `info`. The `info` downgrade is only defensible where a `near` band exists to absorb the "one step off, probably a typo" case. With no `near` band here, `novel` collapses "a shadow differing by one pixel of blur" and "a completely unrelated shadow" into a single class; grading that whole class `info` would under-report the first, which is genuine drift and exactly what the pre-migration rule reported as `warning`.

Because a composite axis has no candidate token to name, the suggestion is the same fixed remediation hint on both the resolver and the legacy path.

The resolver only exists on a full `lyse audit`. Single-file surfaces — MCP `audit_file`, IDE contexts, codemod contexts — have no repo-wide scale and keep the pre-migration behaviour: an exact-match token lookup and an unconditional `warning`.

## Bad

```css
.card { box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
```

## Good

```css
:root { --shadow-sm: 0 1px 3px rgba(0,0,0,0.1); }
.card { box-shadow: var(--shadow-sm); }
```

## Allowlist

```
lyse-disable tokens/no-hardcoded-shadow
```

## Status

Value-drift rule — **experimental** and reported-only; does not contribute to the Health Score until calibrated.

## See also

- [Health Score](../guide/health-score.md)
