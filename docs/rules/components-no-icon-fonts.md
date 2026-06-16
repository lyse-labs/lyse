# `components/no-icon-fonts`

> **Axis:** Components · **Severity:** warning · **Auto-fixable:** no · **Status:** experimental (reported-only, not yet scored)

Checks, at repo level, whether a design system delivers its icons via an **icon webfont** rather than SVG.

## Why

Icon fonts map glyphs to private-use Unicode code points. That breaks in ways SVG doesn't:

- **Screen readers** announce the code point as meaningless characters.
- **Windows High Contrast / `forced-colors`** mode drops the glyphs entirely.
- They **can't be multi-colored**, and they **flash** until the font loads.

SVG icons carry an accessible name (or `aria-hidden` for decorative use), respect forced-colors, and render instantly.

## How

The check is **repo-level**. It looks for any of:

1. An **icon-font dependency** in `package.json` — `font-awesome`, `@fortawesome/fontawesome-free`, `material-icons`, `material-symbols`, `@mdi/font`, `glyphicons`, `typicons.font`, `weathericons`, `dashicons`.
2. An **`@font-face` / `font-family`** declaring a known icon-font family (FontAwesome, Material Icons/Symbols, Glyphicons, icomoon, Typicons, …).
3. **Ligature classes** — `material-icons`, `glyphicon`, `dashicons`, or FontAwesome's `fa fa-*` / `fas fa-*` convention.

Any one signal emits a single repo-level warning.

**SVG-component libraries are not flagged** — `lucide-react`, `@fortawesome/react-fontawesome`, `@heroicons/react`, etc. ship SVG, not a font.

## Bad

```tsx
<span className="material-icons">home</span>
```

## Good

```tsx
import { Home } from "lucide-react";
<Home aria-hidden />
```

## Allowlist

```
lyse-disable components/no-icon-fonts
```

## Status

Experimental and **reported-only**: it does not contribute to the Health Score until calibration data is available.

## See also

- [WCAG / icon-font accessibility issues](https://www.tpgi.com/icon-fonts-versus-svg-icons/)
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
