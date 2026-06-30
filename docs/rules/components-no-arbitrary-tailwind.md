# `components/no-arbitrary-tailwind`

> **Axis:** Components · **Severity:** warning · **Auto-fixable:** no · **Status:** experimental (not scored)

Flags non-color arbitrary Tailwind utilities (`p-[12px]`, `text-[14px]`, `w-[37px]`, `gap-[10px]`, `leading-[19px]`, …) where a literal bracket value bypasses the configured design scale.

## Why

Arbitrary Tailwind values short-circuit the design system contract the same way inline styles do. A spacing change or typography scale update won't catch `text-[14px]` — the drift is invisible to token-based tooling, and to code search that targets scale steps.

Color bracket values (`bg-[#fff]`, `text-[#111]`) are already handled by [`tokens/no-hardcoded-color`](./tokens-no-hardcoded-color.md). This rule covers the non-color remainder: spacing, sizing, typography, layout, and any other literal scale bypass.

## What is flagged

Any `<prefix>-[<value>]` utility in a `className` string where `<value>` is a literal that is **not**:
- a color (`#hex`, `rgb()`, `hsl()`, `oklch()`, etc., or a named CSS color)
- a CSS variable reference (`var(--token)`)

Examples that flag:

```tsx
<div className="p-[12px]" />       // spacing literal
<div className="text-[14px]" />    // font-size literal
<div className="w-[37px]" />       // width literal
<div className="gap-[10px]" />     // gap literal
<div className="leading-[19px]" /> // line-height literal
<div className="rounded-[3px]" />  // border-radius literal
```

## What is NOT flagged

```tsx
// Scale utilities — no brackets
<div className="p-4 text-sm rounded-md" />

// Color brackets — owned by tokens/no-hardcoded-color
<div className="text-[#111] bg-[#fff]" />
<div className="bg-[rgb(255,0,0)]" />

// Token references in brackets
<div className="w-[var(--sidebar-width)]" />
```

## Bad

```tsx
<div className="p-[12px] text-[14px] w-[37px]" />
```

## Good

```tsx
<div className="p-3 text-sm w-9" />
{/* or with a CSS variable for custom values */}
<div className="w-[var(--sidebar-width)]" />
```

## Allowlist

```
lyse-disable components/no-arbitrary-tailwind
```

## Status

Experimental — not yet scored. Precision/recall will be calibrated in a future harvest step.

## See also

- [`tokens/no-hardcoded-color`](./tokens-no-hardcoded-color.md) — color bracket ownership
- [`tokens/no-hardcoded-spacing`](./tokens-no-hardcoded-spacing.md) — spacing token scale
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
