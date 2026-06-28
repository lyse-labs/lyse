# `a11y/contrast-tokens` — Static WCAG-AA contrast check

**Axis:** a11y · **Severity:** warning · **Status:** experimental (off-score)

## What it checks

For each CSS rule, CSS-in-JS block, or inline `style` object that declares **both** a foreground (`color`) and a solid background (`background-color` or a solid `background` shorthand), this rule resolves the colors and checks WCAG 2.x contrast.

A finding is emitted when the contrast ratio falls below:

| Text type | Threshold |
|-----------|-----------|
| Normal text | **4.5:1** (WCAG 2.1 SC 1.4.3 AA) |
| Large text (≥ 24px, or ≥ 18.66px + bold) | **3.0:1** (WCAG 2.1 SC 1.4.3 AA) |

## What it skips

The rule is **recall-safe**: any ambiguity → no verdict.

- Only one of `color`/`background` declared in the block — pair incomplete, skip.
- `color: transparent`, `currentColor`, `inherit`, `initial`, `unset` — not a concrete color, skip.
- `background` with a gradient (`linear-gradient`, `radial-gradient`, etc.) — not a solid color, skip.
- `background` with `url()` — image, not a color, skip.
- Multi-layer `background` (comma-separated layers) — ambiguous, skip.
- `var(--token)` references — the forward token map (DTCG path → value) is not available at static-analysis time; skip rather than guess. Token pairs will be caught once resolved (e.g., in the rendered token fidelity lane).
- Alpha channel in either color (`rgba(0,0,0,0.5)`, `#ffffff80`) — blending makes contrast context-dependent, skip.

## Examples

```css
/* FAIL — 2.85:1, below AA normal (4.5:1) */
.caption {
  color: #999999;
  background: #ffffff;
}

/* PASS — 18.88:1 */
.body-text {
  color: #111111;
  background: #ffffff;
}

/* PASS — 3.03:1, above large-text threshold (3.0:1) */
.heading {
  color: #949494;
  background: #ffffff;
  font-size: 28px;
}

/* SKIP — var() unresolvable statically */
.btn {
  color: var(--color-fg-action);
  background: var(--color-bg-action);
}
```

## Why it matters

Insufficient text contrast (WCAG 2.1 SC 1.4.3) is one of the most common accessibility failures in AI-generated UI. Design system tokens are the right enforcement point: a DS that ships a co-applied color pair below threshold silently propagates that failure to every product built on it.

## Finding message format

```
Contrast <ratio> for <fg> on <bg> is below WCAG AA <threshold>:1
```

Example:

```
Contrast 2.85 for #999999 on #ffffff is below WCAG AA 4.5:1
```

## Experimental status

This rule is experimental (`contributesToScore: false`). It has been validated on a synthetic construction-oracle corpus (J=1.0, n=18), but has not yet been calibrated on real-world design system repos. The Wilson lower bounds at n=18 are ~0.51 — well below the 0.90 promotion gate. Calibration on real repos is required before promotion to stable.

## See also

- [WCAG 2.1 SC 1.4.3 Contrast (Minimum)](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum)
- [`a11y/forced-colors`](./a11y-forced-colors.md) — companion rule for Windows High Contrast / forced-colors mode
- [`tokens/rendered-token-fidelity`](./tokens-rendered-token-fidelity.md) — browser-rendered token resolution for `var()` pairs
