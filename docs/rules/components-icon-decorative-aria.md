# `components/icon-decorative-aria`

> **Axis:** Components · **Severity:** warning · **Auto-fixable:** no · **Status:** scored (v1)

Flags inline `<svg>` icons that declare no accessible treatment.

## Why

An icon is either decorative (it repeats adjacent text — should be silent to a screen reader) or meaningful (it stands alone — must be labelled). A bare `<svg>` declares neither, so assistive tech guesses: many screen readers announce "graphic" or read raw path data. Marking intent — `aria-hidden` for decorative, `role="img"` + a label for meaningful — is the single most common SVG-accessibility fix.

## How

Walks JSX (`.tsx` / `.jsx`) for inline `<svg>` elements and flags any that have **none** of:

- an `aria-hidden`, `role`, `aria-label`, or `aria-labelledby` attribute, or
- a `<title>` child.

The rule is conservative: any one of those clears it, so an author who made any accessibility decision is never nagged.

## Bad

```tsx
<svg viewBox="0 0 16 16"><path d="…" /></svg>
```

## Good

```tsx
{/* decorative */}
<svg aria-hidden="true" viewBox="0 0 16 16"><path d="…" /></svg>
{/* meaningful */}
<svg role="img" aria-label="Search"><path d="…" /></svg>
```

## What does NOT trigger this rule

- Any `<svg>` with `aria-hidden`, `role`, `aria-label`, or `aria-labelledby`.
- Any `<svg>` with a `<title>` child.
- Files with no inline `<svg>` (N/A).

## Allowlist

```
lyse-disable components/icon-decorative-aria
```

## Status

**Scored (v1):** contributes to the Health Score. Promoted 2026-06-20 after clearing both gates on the synthetic recall suite (recall LB 0.901, precision LB 0.916).

## See also

- [`components/svg-viewbox`](./components-svg-viewbox.md) — the scalability sibling for inline SVG icons.
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
