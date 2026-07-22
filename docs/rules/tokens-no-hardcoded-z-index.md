# `tokens/no-hardcoded-z-index`

> **Axis:** Tokens · **Severity:** warning (`near`) / info (`novel`) · **Auto-fixable:** no · **Status:** stable (scored)

Flags hardcoded `z-index` values that don't come from a z-index token scale.

## Why

Z-index without a shared scale is one of the most common sources of UI bugs in a design system: each component picks an arbitrary large number to "win", and overlays, dropdowns, tooltips, and modals end up fighting unpredictably (`z-index: 9999` … `z-index: 99999`).

A small, named scale (`--z-dropdown`, `--z-modal`, `--z-toast`) makes stacking order an explicit, reviewable decision shared across the system.

## How

Scans CSS and CSS-in-JS for `z-index: <integer>` declarations.

- **Trivial local values** `-1`, `0`, `1` are never flagged (legitimate local stacking contexts).
- **Tokenized references** (`z-index: var(--z-modal)`) are not flagged.
- When a z-index **token scale** is loaded (`ctx.tokens.zIndex`), values **on the scale** are compliant; **off-scale** values are flagged.
- With no scale loaded, any non-trivial hardcoded value is still reported — the system has no shared ordering — but at `info`, see below.

## How the value is resolved

On a full `lyse audit`, every z-index literal is resolved against the repo's own z-index scale, derived from the Design System Graph (Tailwind config, `*.tokens.json`, CSS custom properties, SCSS variables). The resolution places the value in exactly one of four classes:

| Class | Meaning | What this rule emits |
|---|---|---|
| `exact` | The value is on the repo's own z-index scale | nothing — this is compliant usage, not drift |
| `near` | One scale step away from a token (needs a scale with at least two entries — see below) | **warning**, confidence medium; the candidate token is named in the suggestion |
| `novel` | A real value that resembles no token on this axis | **info**, confidence low |
| `unresolved` | Not judgeable statically (`var(--x)`, a SCSS `$var`, a CSS-wide keyword) | nothing — counted in the audit's `meta.abstentions`. **Unreachable on this axis** (see below) |

**`near` needs at least two tokens on the axis.** A one-token axis has no adjacent gap, so it has no observable step unit and "one step away" would be a manufactured number — every non-matching value on such an axis resolves `novel` instead. An exact hit on a one-token axis still resolves `exact`.

`unresolved` is listed for completeness only: this rule's extractor matches a numeric literal and nothing else, so `var(--x)` / `$var` / keyword values never reach the resolver and this axis contributes 0 to `meta.abstentions`.

Z-index is a unitless axis, so the 16px-root length normalization that applies to the length-valued axes (spacing, radii, border widths, breakpoints) is not involved here.

**There is no fallback scale on this axis.** A repo with no z-index tokens at all resolves every z-index literal `novel`, so it gets `info` rather than `warning`. That is a real behaviour change: before the migration those same literals were reported as warnings.

The resolver only exists on a full `lyse audit`. Single-file surfaces — MCP `audit_file`, IDE contexts, codemod contexts — have no repo-wide scale and keep the pre-migration behaviour: an exact-match token lookup and an unconditional `warning`.

## Bad

```css
.modal { z-index: 9999; }
```

## Good

```css
:root { --z-modal: 400; }
.modal { z-index: var(--z-modal); }
```

## Allowlist

```
lyse-disable tokens/no-hardcoded-z-index
```

## Status

This is a value-drift rule; like the other hardcoded-value detectors it is **stable** and **scored**: it contributes to the Health Score.

## See also

- [MDN: `z-index`](https://developer.mozilla.org/en-US/docs/Web/CSS/z-index)
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
