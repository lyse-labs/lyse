# `a11y/runtime-axe`

> **Axis:** A11y · **Severity:** warning · **Auto-fixable:** no · **Status:** experimental (does not contribute to the Health Score) · **Render-only** (`lyse audit --render`)

Runs [axe-core](https://github.com/dequelabs/axe-core) against your design system's real rendered components, sourced from a **pre-built Storybook** (`storybook-static/` or a running URL). Each axe violation becomes one Lyse finding.

## Why

Static analysis cannot see the rendered DOM. Color contrast, missing alt text, ARIA misuse — these defects exist only in the browser and are invisible to token-level or AST-level checks. Running axe-core on each Storybook story closes that gap, surfacing the runtime a11y bugs that ship to real assistive-technology users.

## How

The check is **render-layer** (opt-in, `--render` flag):

1. **Locate Storybook** — finds a pre-built `storybook-static/` directory (auto-detected from the repo root, or explicit via `--storybook`) or resolves a running Storybook URL.
2. **Enumerate stories** — reads `storybook-static/index.json` (Storybook 7+) or `stories.json` (Storybook 6) to get the full story list.
3. **Inject and run** — for each story, opens it in a headless Chromium page via Playwright, injects axe-core, and runs the full default ruleset.
4. **Map violations** — each axe violation becomes a Lyse finding. Severity maps from axe impact: `critical`/`serious` → `error`, `moderate`/`minor` → `warning`.

Stories that fail to render are skipped; the rest continue. The default `lyse audit` is unchanged: no browser, no network.

## How to run

```bash
# Build your Storybook first (Lyse never builds it for you):
npx storybook build            # produces storybook-static/

# Then audit with the render layer enabled:
lyse audit --render                                   # auto-detects ./storybook-static
lyse audit --render --storybook path/to/storybook-static
lyse audit --render --storybook https://your-storybook.example.com
```

Requires Playwright + Chromium: `npm i -D playwright && npx playwright install chromium`. If absent, the render layer skips cleanly.

## When it is N/A

- No `--render` flag.
- No Storybook found or provided.
- Playwright/Chromium not installed.
- A story fails to render — it is skipped; the rest continue.

## Scope and honesty

axe-core automates roughly 30% of WCAG success criteria. A clean runtime-axe result is **not** a guarantee of accessibility — it complements, never replaces, manual audits and assistive-technology testing.

## Bad

```html
<img src="logo.png">
```

## Good

```html
<img src="logo.png" alt="Acme logo">
```

## What does NOT trigger this rule

- Any element that satisfies its axe-core rule (accessible name present, role correct, contrast sufficient, etc.).
- Stories that render but produce zero axe violations.
- Any run without `--render` (N/A).

## Status

**Experimental:** does not contribute to the Health Score. Reported-only until calibration data is available from real design system corpora.

## See also

- [`a11y/essentials`](./a11y-essentials.md) — static WCAG essentials check (always runs).
- [`a11y/forced-colors`](./a11y-forced-colors.md) — high-contrast mode affordance.
- [axe-core](https://github.com/dequelabs/axe-core) — the accessibility engine used.
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
