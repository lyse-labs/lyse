# `tokens/rendered-token-fidelity`

> **Axis:** Tokens · **Severity:** warning · **Auto-fixable:** no · **Status:** experimental (does not contribute to the Health Score) · **Render-only** (`lyse audit --render`)

Detects design→CSS drift: a CSS custom property whose **browser-computed value** differs from its **DTCG canonical token value**. Runs only under `lyse audit --render`.

## Why

A token can be referenced correctly yet render a different value due to cascade, specificity, or a leaked override — drift that static analysis cannot see. Static checks confirm a `var()` *reference* exists; only the browser knows what that reference actually computes to.

## How

The check is **render-layer** (opt-in, `--render` flag):

1. **Resolve the DTCG canonical map** — each token path maps to its declared canonical value (`canonicalize`).
2. **Read computed values** — for each rendered CSS custom property, the browser-computed value is captured (`ComputedTokenReading`).
3. **Map var → token path** — `cssVarToTokenPath` resolves each `--custom-property` back to its DTCG token path.
4. **Compare canonically** — declared and computed values are normalised the same way (hex/rgb/etc.); a mismatch becomes one finding. Values that canonicalize to `skip` (non-comparable) are ignored.

The default `lyse audit` is unchanged: no browser, no network.

## Bad

```css
:root { --bg: #fff }
.leak { --bg: #000 } /* DTCG declares #fff; element computes rgb(0,0,0) — drift */
```

## Good

```css
:root { --bg: #fff } /* DTCG declares #fff; element computes rgb(255,255,255) — match */
```

## When it is N/A

- No `--render` flag.
- No rendered token readings available for the audited surface.
- A custom property that does not resolve to a known DTCG token path.
- Values that cannot be compared canonically (skipped).

## Status

**Experimental:** does not contribute to the Health Score. Reported-only until calibration data is available from real design system corpora.

## See also

- [`a11y/contrast-tokens`](./a11y-contrast-tokens.md) — static WCAG-AA contrast on literal token pairs.
- [`a11y/runtime-axe`](./a11y-runtime-axe.md) — the other render-only rule (runtime accessibility).
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
