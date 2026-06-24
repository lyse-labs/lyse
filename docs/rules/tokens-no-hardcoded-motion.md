# `tokens/no-hardcoded-motion`

> **Axis:** Tokens · **Severity:** warning · **Auto-fixable:** no · **Status:** stable (scored)

Flags hardcoded transition/animation **durations** and custom **`cubic-bezier()` easing curves** that don't come from a motion token scale.

## Why

Inconsistent durations (`180ms` here, `240ms` there) and ad-hoc bezier curves make a system's motion feel incoherent and untunable. A small motion scale (`--duration-fast/base/slow`, `--easing-standard/emphasized`) makes timing a deliberate, shared decision.

## How

Scans CSS / CSS-in-JS for:

- **Durations** — `<n>s` / `<n>ms` in `transition-duration` / `animation-duration` longhands and in the `transition` / `animation` shorthand.
- **Easings** — custom `cubic-bezier(...)` curves.

Exempt: zero durations, `var(...)` references, and standard easing keywords (`ease`, `linear`, `ease-in-out`, …). When a motion token scale is loaded (`ctx.tokens.motion`, keys prefixed `duration/` / `easing/`), on-scale values are compliant (whitespace-insensitive); off-scale values are flagged.

## Bad

```css
.x { transition: all 0.24s cubic-bezier(0.1, 0.2, 0.3, 0.4); }
```

## Good

```css
:root { --duration-base: 200ms; --easing-standard: cubic-bezier(0.4, 0, 0.2, 1); }
.x { transition: all var(--duration-base) var(--easing-standard); }
```

## Allowlist

```
lyse-disable tokens/no-hardcoded-motion
```

## Status

Value-drift rule — **stable** and **scored**: it contributes to the Health Score.

## See also

- [Health Score](../guide/health-score.md)
