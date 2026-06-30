# color-harvest-labels

## Overview

- **Repos harvested:** mantine (741 findings), primer-css (36 findings), primitives (4 findings), shadcn-ui (1045 findings) — total 1826 findings
- **CSS-centric repo added:** `primer/css` (plain Sass/CSS) cloned 2026-06-27 — 36 findings, all .scss/.css/.js
- **Sample size:** 150 rows (stratified by repo + fileType; deterministic stride within each stratum)
- **Sampling:** mantine=45, primer-css=36 (all), primitives=4 (all), shadcn-ui=65; no repo exceeds 43.3% of sample
- **Labeled by:** mechanical rubric + human adjudication (2026-06-25)

## Adjudication note

Third-party brand colors (e.g. Discord `#5865f2`) and functional values (color-picker default seed, color-space/spectrum art, canvas/viz color, `<meta theme-color>` config) all count as **FP**, not drift. Only colors of the DS itself that should reference a token are TP. All items in the prior "ambiguous tail" are labelled FP with best-fitting fpClass: third-party brand → `other`; picker default/spectrum/canvas → `other` or `data-palette`; meta theme-color → `config`.

## Summary

| | count |
|---|---|
| TP | 10 |
| FP | 140 |
| **Total sample** | **150** |

**Implied current precision: 6.7%**

### FP breakdown by class

| fpClass | count |
|---------|-------|
| config | 60 |
| token-def | 29 |
| data-palette | 21 |
| story-test | 11 |
| svg-icon | 10 |
| other | 9 |

### Detectable FP classes

| fpClass | count | detectable | detection idea |
|---------|-------|-----------|----------------|
| config | 60 | yes | Path patterns: `.yarn/`, `normalize.scss`, `.storybook/`, config-like filenames (`theme.ts`, `themes.ts`, `variables.scss` with mixin call); oklch(from var(…)) / color-mix(in_oklch,var(…)) with no literal |
| token-def | 29 | yes | File path ends with `theme.ts`, `themes.ts`, `variables.scss`, or contains `colors-generator`; or value is inside a CSS `@include color-variables(` call |
| data-palette | 21 | yes | File path contains `shiki-themes`, `colors-generator`, `ColorsGenerator`, `colors-preset`; or value is inside a hue/saturation gradient in a ColorPicker component path |
| story-test | 11 | yes | Path segments: `apps/storybook/`, `.storybook/`, `@mantine-tests/`, `apps/ssr-testing/` |
| svg-icon | 10 | yes | File path ends with `Icon.tsx`, `Icon.ts`, value is `fill=` or `stroke=` on SVG path; or path contains `dev-icons/`, `LogoAssets/` |
| other | 9 | mixed | rgba(theme.*) / rgba(parsedValue) → detectable (no literal in source); third-party brand hex in component CSS → NOT detectable |

**Residual non-detectable FP:** 3 (Discord brand hex #5865f2/#535ed4/#4753d4 in plain component CSS — structurally identical to genuine drift)

---

## Full labeled dataset

| id | repo | file:line | fileType | label | fpClass | detectable | reason |
|----|------|-----------|----------|-------|---------|-----------|--------|
| 1 | mantine | .yarn/releases/yarn-4.17.0.cjs:140 | .cjs | FP | config | yes | Yarn release binary — not UI code; .yarn/ path |
| 2 | mantine | .yarn/releases/yarn-4.17.0.cjs:140 | .cjs | FP | config | yes | Yarn release binary — not UI code; .yarn/ path |
| 3 | mantine | .yarn/releases/yarn-4.17.0.cjs:400 | .cjs | FP | config | yes | Yarn release binary — not UI code; .yarn/ path |
| 4 | mantine | .yarn/releases/yarn-4.17.0.cjs:400 | .cjs | FP | config | yes | Yarn release binary — not UI code; .yarn/ path |
| 5 | mantine | .yarn/releases/yarn-4.17.0.cjs:400 | .cjs | FP | config | yes | Yarn release binary — not UI code; .yarn/ path |
| 6 | mantine | .yarn/releases/yarn-4.17.0.cjs:400 | .cjs | FP | config | yes | Yarn release binary — not UI code; .yarn/ path |
| 7 | mantine | .yarn/releases/yarn-4.17.0.cjs:400 | .cjs | FP | config | yes | Yarn release binary — not UI code; .yarn/ path |
| 8 | mantine | .yarn/releases/yarn-4.17.0.cjs:400 | .cjs | FP | config | yes | Yarn release binary — not UI code; .yarn/ path |
| 9 | mantine | apps/help.mantine.dev/src/components/MdxElements/MdxInfo/MdxInfo.tsx:14 | .tsx | FP | other | yes | rgba(theme.colors.blue[6], 0.2) — no hardcoded literal; rule over-fires on Mantine rgba() utility |
| 10 | mantine | apps/help.mantine.dev/src/components/QuestionsList/QuestionsListHeader/QuestionsListHeader.module.css:12 | .css | TP | — | — | Black overlay rgba hardcoded in component module CSS — should use an overlay/shadow token |
| 11 | mantine | apps/help.mantine.dev/src/components/SocialCards/SocialCards.module.css:26 | .css | FP | other | no | Discord brand color #5865f2 — third-party brand embed; not DS drift; structurally looks like any literal |
| 12 | mantine | apps/mantine.dev/src/components/Banner/Banner.module.css:58 | .css | TP | — | — | Hardcoded rgba(255,255,255,0.2) in component module CSS — should use a translucent-white token |
| 13 | mantine | apps/mantine.dev/src/components/ColorsGenerator/ColorsInput/colors-preset.ts:2 | .ts | FP | data-palette | yes | Reference color preset list for color generator UI — data, not styling; path contains ColorsGenerator |
| 14 | mantine | apps/mantine.dev/src/components/HomePage/HomePageJoin/SocialCards/SocialCards.module.css:22 | .css | FP | other | no | Discord brand color #5865f2 — third-party brand embed; not DS drift |
| 15 | mantine | apps/mantine.dev/src/components/HomePage/HomePageJoin/SocialCards/SocialCards.module.css:26 | .css | FP | other | no | Discord brand color #4753d4 — third-party brand embed (Discord purple variant); not DS drift |
| 16 | mantine | apps/mantine.dev/src/components/HomePage/HomePageJumbotron/HomePageJumbotron.module.css:61 | .css | TP | — | — | CSS gradient with hardcoded rgba(255,255,255,0.5/1) in component module CSS — should use token |
| 17 | mantine | apps/mantine.dev/src/components/icons/ViteIcon.tsx:18 | .tsx | FP | svg-icon | yes | Icon/SVG component — SVG path data, not UI token usage |
| 18 | mantine | apps/mantine.dev/src/components/icons/ViteIcon.tsx:112 | .tsx | FP | svg-icon | yes | Icon/SVG fill value on vector art — Icon.tsx path |
| 19 | mantine | apps/mantine.dev/src/components/LogoAssets/assets/index.ts:23 | .ts | FP | svg-icon | yes | SVG source code embedded as string in LogoAssets — path contains LogoAssets |
| 20 | mantine | apps/mantine.dev/src/components/MdxProvider/MdxInfo/MdxInfo.tsx:14 | .tsx | FP | other | yes | rgba(theme.colors.blue[4], 0.2) — no hardcoded literal; rule over-fires on Mantine rgba() utility |
| 21 | mantine | apps/mantine.dev/theme.ts:44 | .ts | FP | token-def | yes | Theme definition file — color values ARE the token definitions; theme.ts path |
| 22 | mantine | packages/@mantine-tests/core/src/shared/it-supports-style.tsx:17 | .tsx | FP | story-test | yes | Test utility in @mantine-tests — path contains @mantine-tests |
| 23 | mantine | packages/@mantine/code-highlight/src/CodeHighlightProvider/adapters/shiki-themes.ts:37 | .ts | FP | data-palette | yes | Shiki syntax highlight theme — path contains shiki-themes |
| 24 | mantine | packages/@mantine/code-highlight/src/CodeHighlightProvider/adapters/shiki-themes.ts:73 | .ts | FP | data-palette | yes | Shiki syntax highlight theme — path contains shiki-themes |
| 25 | mantine | packages/@mantine/code-highlight/src/CodeHighlightProvider/adapters/shiki-themes.ts:108 | .ts | FP | data-palette | yes | Shiki syntax highlight theme — path contains shiki-themes |
| 26 | mantine | packages/@mantine/code-highlight/src/CodeHighlightProvider/adapters/shiki-themes.ts:143 | .ts | FP | data-palette | yes | Shiki syntax highlight theme — path contains shiki-themes |
| 27 | mantine | packages/@mantine/code-highlight/src/CodeHighlightProvider/adapters/shiki-themes.ts:178 | .ts | FP | data-palette | yes | Shiki syntax highlight theme — path contains shiki-themes |
| 28 | mantine | packages/@mantine/code-highlight/src/CodeHighlightProvider/adapters/shiki-themes.ts:214 | .ts | FP | data-palette | yes | Shiki syntax highlight theme — path contains shiki-themes |
| 29 | mantine | packages/@mantine/code-highlight/src/CodeHighlightProvider/adapters/shiki-themes.ts:321 | .ts | FP | data-palette | yes | Shiki syntax highlight theme — path contains shiki-themes |
| 30 | mantine | packages/@mantine/code-highlight/src/CodeHighlightProvider/adapters/shiki-themes.ts:534 | .ts | FP | data-palette | yes | Shiki syntax highlight theme — path contains shiki-themes |
| 31 | mantine | packages/@mantine/code-highlight/src/CodeHighlightProvider/adapters/shiki-themes.ts:616 | .ts | FP | data-palette | yes | Shiki syntax highlight theme — path contains shiki-themes |
| 32 | mantine | packages/@mantine/code-highlight/src/CodeHighlightProvider/adapters/shiki-themes.ts:666 | .ts | FP | data-palette | yes | Shiki syntax highlight theme — path contains shiki-themes |
| 33 | mantine | packages/@mantine/code-highlight/src/CodeHighlightProvider/adapters/shiki-themes.ts:958 | .ts | FP | data-palette | yes | Shiki syntax highlight theme — path contains shiki-themes |
| 34 | mantine | packages/@mantine/core/src/components/ActionIcon/ActionIcon.module.css:76 | .css | TP | — | — | rgba(0,0,0,0.15) hardcoded in component module CSS — should use a dark-overlay token |
| 35 | mantine | packages/@mantine/core/src/components/Blockquote/Blockquote.tsx:81 | .tsx | FP | other | yes | rgba(lightParsed.value, 0.07) — no hardcoded literal; uses dynamic parsed theme value; rule over-fires |
| 36 | mantine | packages/@mantine/core/src/components/ColorPicker/ColorPicker.module.css:61 | .css | TP | — | — | rgba(0,0,0,0.6) hardcoded box-shadow in component CSS — should use an overlay token |
| 37 | mantine | packages/@mantine/core/src/components/ColorPicker/converters/converters.ts:76 | .ts | FP | other | yes | '#000000' as fallback in color format converter — functional default in color utility, not DS styling |
| 38 | mantine | packages/@mantine/core/src/components/ColorPicker/HueSlider/HueSlider.tsx:40 | .tsx | FP | other | yes | Hue spectrum gradient in ColorPicker — HSL values define the full color spectrum (functional picker art); ColorPicker path is detectable |
| 39 | mantine | packages/@mantine/core/src/components/ColorPicker/Saturation/Saturation.tsx:109 | .tsx | FP | other | yes | Saturation overlay gradient #fff→transparent in ColorPicker — functional spectrum art; ColorPicker path detectable |
| 40 | mantine | packages/@mantine/core/src/components/ColorSwatch/ColorSwatch.module.css:43 | .css | TP | — | — | rgba(0,0,0,0.1/0.15) hardcoded box-shadow in component CSS — should use token |
| 41 | mantine | packages/@mantine/core/src/components/Progress/Progress.module.css:70 | .css | TP | — | — | rgba(255,255,255,0.15) hardcoded stripe gradient in component CSS — should use token |
| 42 | mantine | packages/@mantine/core/src/components/Progress/Progress.module.css:103 | .css | TP | — | — | rgba(255,255,255,0.15) hardcoded stripe gradient in component CSS — should use token |
| 43 | mantine | packages/@mantine/core/src/components/ScrollArea/ScrollArea.module.css:90 | .css | TP | — | — | rgba(255,255,255,0.5) hardcoded in component module CSS — should use token |
| 44 | mantine | packages/@mantinex/colors-generator/src/ColorsGenerator/ColorsGenerator.tsx:12 | .tsx | FP | data-palette | yes | Reference palette array for color generation algorithm — data palette; path contains ColorsGenerator |
| 45 | mantine | packages/@mantinex/dev-icons/src/CssIcon.tsx:18 | .tsx | FP | svg-icon | yes | Icon SVG fill="#fff" on vector art — dev-icons path + fill on SVG |
| 46 | primer-css | docs/.storybook/storybook.css:20 | .css | FP | story-test | yes | Storybook config CSS (docs/.storybook/) — outline color for story wrapper, not component styling |
| 47 | primer-css | docs/.storybook/theme.js:8 | .js | FP | story-test | yes | Storybook theme config file — SVG icon color in docs/.storybook/ |
| 48 | primer-css | src/base/normalize.scss:307 | .scss | FP | config | yes | Browser normalize/reset — #c0c0c0 is the standard fieldset border; normalize.scss path is detectable |
| 49 | primer-css | src/box/box-overlay.scss:10 | .scss | TP | — | — | rgb(0,0,0,0.4) hardcoded box-shadow in component SCSS — has stylelint-disable comment confirming it is a known drift |
| 50 | primer-css | src/header/header.scss:49 | .scss | TP | — | — | rgb(255,255,255,0.75) hardcoded placeholder color in header SCSS — stylelint-disable confirms known drift |
| 51 | primer-css | src/marketing/buttons/button.scss:20 | .scss | FP | config | yes | oklch(from var(--color-mktg-btn-bg)) relative-color expression — no hardcoded literal; uses CSS variable reference |
| 52 | primer-css | src/marketing/buttons/button.scss:20 | .scss | TP | — | — | rgb(255,255,255,0.15) and rgb(255,255,255,0) hardcoded white-overlay gradient in marketing button — stylelint-disable confirms DS drift |
| 53 | primer-css | src/marketing/buttons/button.scss:37 | .scss | TP | — | — | rgb(255,255,255,0.15) and rgb(255,255,255,0) hardcoded white-overlay gradient in marketing button — DS drift |
| 54 | primer-css | src/marketing/buttons/button.scss:37 | .scss | TP | — | — | rgb(255,255,255,0.15) hardcoded white-overlay gradient in marketing button ::before — DS drift |
| 55 | primer-css | src/marketing/buttons/button.scss:133 | .scss | TP | — | — | #fff and rgb(52,183,89,0.15) hardcoded in marketing button .btn-signup-mktg — stylelint-disable confirms DS drift |
| 56 | primer-css | src/marketing/buttons/button.scss:135 | .scss | TP | — | — | rgb(52,183,89,0.15) and rgb(46,164,79,0/1) in green marketing button gradient — DS drift |
| 57 | primer-css | src/marketing/buttons/button.scss:135 | .scss | TP | — | — | rgb(46,164,79) hardcoded green brand color in marketing button — DS drift |
| 58 | primer-css | src/marketing/buttons/button.scss:135 | .scss | TP | — | — | rgb(46,164,79,0) hardcoded fade in marketing button gradient — DS drift |
| 59 | primer-css | src/marketing/buttons/button.scss:139 | .scss | TP | — | — | rgb(52,183,89,0.15)/rgb(46,164,79,0) in marketing button ::before — DS drift |
| 60 | primer-css | src/marketing/buttons/button.scss:139 | .scss | TP | — | — | rgb(52,183,89,0.15)/rgb(46,164,79,0) in marketing button ::before — DS drift |
| 61 | primer-css | src/marketing/support/variables.scss:129 | .scss | FP | token-def | yes | $mktg-btn-shadow-hover-light Sass variable definition — this IS the token definition; variables.scss |
| 62 | primer-css | src/marketing/support/variables.scss:129 | .scss | FP | token-def | yes | Sass shadow variable definition (multiple rgb() values in shadow list) — token-def |
| 63 | primer-css | src/marketing/support/variables.scss:129 | .scss | FP | token-def | yes | Sass shadow variable definition — token-def |
| 64 | primer-css | src/marketing/support/variables.scss:129 | .scss | FP | token-def | yes | Sass shadow variable definition — token-def |
| 65 | primer-css | src/marketing/support/variables.scss:129 | .scss | FP | token-def | yes | Sass shadow variable definition — token-def |
| 66 | primer-css | src/marketing/support/variables.scss:129 | .scss | FP | token-def | yes | Sass shadow variable definition — token-def |
| 67 | primer-css | src/marketing/support/variables.scss:130 | .scss | FP | token-def | yes | Sass shadow variable definition — token-def |
| 68 | primer-css | src/marketing/support/variables.scss:130 | .scss | FP | token-def | yes | Sass shadow variable definition — token-def |
| 69 | primer-css | src/marketing/support/variables.scss:130 | .scss | FP | token-def | yes | Sass shadow variable definition — token-def |
| 70 | primer-css | src/marketing/support/variables.scss:130 | .scss | FP | token-def | yes | Sass shadow variable definition — token-def |
| 71 | primer-css | src/marketing/support/variables.scss:130 | .scss | FP | token-def | yes | Sass shadow variable definition — token-def |
| 72 | primer-css | src/marketing/support/variables.scss:130 | .scss | FP | token-def | yes | Sass shadow variable definition — token-def |
| 73 | primer-css | src/marketing/support/variables.scss:130 | .scss | FP | token-def | yes | Sass shadow variable definition — token-def |
| 74 | primer-css | src/marketing/support/variables.scss:130 | .scss | FP | token-def | yes | Sass shadow variable definition — token-def |
| 75 | primer-css | src/marketing/support/variables.scss:134 | .scss | FP | token-def | yes | @include color-variables() call — defines color tokens inside Sass mixin; variables.scss |
| 76 | primer-css | src/marketing/support/variables.scss:134 | .scss | FP | token-def | yes | @include color-variables() — token definition block |
| 77 | primer-css | src/marketing/support/variables.scss:135 | .scss | FP | token-def | yes | @include color-variables() — token definition block |
| 78 | primer-css | src/marketing/support/variables.scss:135 | .scss | FP | token-def | yes | @include color-variables() — token definition block |
| 79 | primer-css | src/marketing/support/variables.scss:136 | .scss | FP | token-def | yes | @include color-variables() — token definition block |
| 80 | primer-css | src/marketing/support/variables.scss:136 | .scss | FP | token-def | yes | @include color-variables() — token definition block |
| 81 | primer-css | src/marketing/support/variables.scss:138 | .scss | FP | token-def | yes | @include color-variables() — token definition block (rgb with / syntax) |
| 82 | primitives | apps/ssr-testing/app/roving-focus-group/roving-focus.client.tsx:75 | .tsx | FP | story-test | yes | SSR integration test app fixture — apps/ssr-testing path |
| 83 | primitives | apps/storybook/stories/external-overlay.tsx:35 | .tsx | FP | story-test | yes | Storybook story file — apps/storybook/stories path |
| 84 | primitives | apps/storybook/stories/external-overlay.tsx:36 | .tsx | FP | story-test | yes | Storybook story file — apps/storybook/stories path |
| 85 | primitives | apps/storybook/stories/external-overlay.tsx:39 | .tsx | FP | story-test | yes | Storybook story file — apps/storybook/stories path |
| 86 | shadcn-ui | apps/v4/app/(app)/create/components/icon-library-picker.tsx:53 | .tsx | FP | svg-icon | yes | Icon SVG fill="#fff" on SVG path element — file is an icon picker component |
| 87 | shadcn-ui | apps/v4/hooks/use-meta-color.ts:5 | .ts | FP | config | yes | META_THEME_COLORS constant (#ffffff/#0a0a0a) for <meta name=theme-color> — config file, not UI styling |
| 88 | shadcn-ui | apps/v4/registry/bases/base/ui/chart.tsx:68 | .tsx | FP | config | yes | Recharts attribute-selector override fill="#ccc" — targets third-party lib defaults; registry/bases path |
| 89 | shadcn-ui | apps/v4/registry/bases/radix/ui/chart.tsx:68 | .tsx | FP | config | yes | Recharts attribute-selector override — registry/bases path |
| 90 | shadcn-ui | apps/v4/registry/styles/style-luma.css:1388 | .css | FP | config | yes | oklch(from_var(--primary)…) in @apply arbitrary class — no hardcoded literal; relative-color from CSS var |
| 91 | shadcn-ui | apps/v4/registry/styles/style-luma.css:1388 | .css | FP | config | yes | oklch(from_var(--primary)…) — no hardcoded literal; relative-color from CSS var |
| 92 | shadcn-ui | apps/v4/registry/styles/style-lyra.css:1367 | .css | FP | config | yes | oklch(from_var(--primary)…) — no hardcoded literal; relative-color from CSS var |
| 93 | shadcn-ui | apps/v4/registry/styles/style-lyra.css:1367 | .css | FP | config | yes | oklch(from_var(--primary)…) — no hardcoded literal |
| 94 | shadcn-ui | apps/v4/registry/styles/style-maia.css:1388 | .css | FP | config | yes | oklch(from_var(--primary)…) — no hardcoded literal |
| 95 | shadcn-ui | apps/v4/registry/styles/style-maia.css:1388 | .css | FP | config | yes | oklch(from_var(--primary)…) — no hardcoded literal |
| 96 | shadcn-ui | apps/v4/registry/styles/style-mira.css:1394 | .css | FP | config | yes | oklch(from_var(--primary)…) — no hardcoded literal |
| 97 | shadcn-ui | apps/v4/registry/styles/style-mira.css:1394 | .css | FP | config | yes | oklch(from_var(--primary)…) — no hardcoded literal |
| 98 | shadcn-ui | apps/v4/registry/styles/style-nova.css:1388 | .css | FP | config | yes | oklch(from_var(--primary)…) — no hardcoded literal |
| 99 | shadcn-ui | apps/v4/registry/styles/style-nova.css:1388 | .css | FP | config | yes | oklch(from_var(--primary)…) — no hardcoded literal |
| 100 | shadcn-ui | apps/v4/registry/styles/style-rhea.css:1388 | .css | FP | config | yes | oklch(from_var(--primary)…) — no hardcoded literal |
| 101 | shadcn-ui | apps/v4/registry/styles/style-rhea.css:1388 | .css | FP | config | yes | oklch(from_var(--primary)…) — no hardcoded literal |
| 102 | shadcn-ui | apps/v4/registry/styles/style-sera.css:1379 | .css | FP | config | yes | oklch(from_var(--primary)…) — no hardcoded literal |
| 103 | shadcn-ui | apps/v4/registry/styles/style-sera.css:1379 | .css | FP | config | yes | oklch(from_var(--primary)…) — no hardcoded literal |
| 104 | shadcn-ui | apps/v4/registry/styles/style-vega.css:1384 | .css | FP | config | yes | oklch(from_var(--primary)…) — no hardcoded literal |
| 105 | shadcn-ui | apps/v4/registry/themes.ts:34 | .ts | FP | token-def | yes | themes.ts registry — defines DS token values |
| 106 | shadcn-ui | apps/v4/registry/themes.ts:63 | .ts | FP | token-def | yes | themes.ts — token definition |
| 107 | shadcn-ui | apps/v4/registry/themes.ts:100 | .ts | FP | token-def | yes | themes.ts — token definition |
| 108 | shadcn-ui | apps/v4/registry/themes.ts:130 | .ts | FP | token-def | yes | themes.ts — token definition |
| 109 | shadcn-ui | apps/v4/registry/themes.ts:167 | .ts | FP | token-def | yes | themes.ts — token definition |
| 110 | shadcn-ui | apps/v4/registry/themes.ts:197 | .ts | FP | token-def | yes | themes.ts — token definition |
| 111 | shadcn-ui | apps/v4/registry/themes.ts:234 | .ts | FP | token-def | yes | themes.ts — token definition |
| 112 | shadcn-ui | apps/v4/registry/themes.ts:262 | .ts | FP | token-def | yes | themes.ts — token definition |
| 113 | shadcn-ui | apps/v4/registry/themes.ts:291 | .ts | FP | token-def | yes | themes.ts — token definition |
| 114 | shadcn-ui | apps/v4/registry/themes.ts:328 | .ts | FP | token-def | yes | themes.ts — token definition |
| 115 | shadcn-ui | apps/v4/registry/themes.ts:358 | .ts | FP | token-def | yes | themes.ts — token definition |
| 116 | shadcn-ui | apps/v4/registry/themes.ts:395 | .ts | FP | token-def | yes | themes.ts — token definition |
| 117 | shadcn-ui | apps/v4/registry/themes.ts:425 | .ts | FP | token-def | yes | themes.ts — token definition |
| 118 | shadcn-ui | apps/v4/registry/themes.ts:462 | .ts | FP | token-def | yes | themes.ts — token definition |
| 119 | shadcn-ui | apps/v4/registry/themes.ts:492 | .ts | FP | token-def | yes | themes.ts — token definition |
| 120 | shadcn-ui | apps/v4/registry/themes.ts:528 | .ts | FP | token-def | yes | themes.ts — token definition |
| 121 | shadcn-ui | apps/v4/registry/themes.ts:567 | .ts | FP | token-def | yes | themes.ts — token definition |
| 122 | shadcn-ui | apps/v4/registry/themes.ts:607 | .ts | FP | token-def | yes | themes.ts — token definition |
| 123 | shadcn-ui | apps/v4/registry/themes.ts:646 | .ts | FP | token-def | yes | themes.ts — token definition |
| 124 | shadcn-ui | apps/v4/registry/themes.ts:693 | .ts | FP | token-def | yes | themes.ts — token definition |
| 125 | shadcn-ui | apps/v4/registry/themes.ts:732 | .ts | FP | token-def | yes | themes.ts — token definition |
| 126 | shadcn-ui | apps/v4/registry/themes.ts:772 | .ts | FP | token-def | yes | themes.ts — token definition |
| 127 | shadcn-ui | apps/v4/registry/themes.ts:810 | .ts | FP | token-def | yes | themes.ts — token definition |
| 128 | shadcn-ui | apps/v4/registry/themes.ts:858 | .ts | FP | token-def | yes | themes.ts — token definition |
| 129 | shadcn-ui | apps/v4/registry/themes.ts:896 | .ts | FP | token-def | yes | themes.ts — token definition |
| 130 | shadcn-ui | apps/v4/registry/themes.ts:937 | .ts | FP | token-def | yes | themes.ts — token definition |
| 131 | shadcn-ui | apps/v4/registry/themes.ts:975 | .ts | FP | token-def | yes | themes.ts — token definition |
| 132 | shadcn-ui | apps/v4/registry/themes.ts:1014 | .ts | FP | token-def | yes | themes.ts — token definition |
| 133 | shadcn-ui | apps/v4/registry/themes.ts:1061 | .ts | FP | token-def | yes | themes.ts — token definition |
| 134 | shadcn-ui | apps/v4/styles/base-luma/ui/bubble.tsx:30 | .tsx | FP | config | yes | color-mix(in_oklch,var(--muted),var(--foreground)_5%) Tailwind arbitrary class — no hardcoded literal; uses CSS vars only |
| 135 | shadcn-ui | apps/v4/styles/base-lyra/ui/bubble.tsx:30 | .tsx | FP | config | yes | color-mix(in_oklch,var(…)) — no hardcoded literal |
| 136 | shadcn-ui | apps/v4/styles/base-maia/ui/bubble.tsx:30 | .tsx | FP | config | yes | color-mix(in_oklch,var(…)) — no hardcoded literal |
| 137 | shadcn-ui | apps/v4/styles/base-mira/ui/bubble.tsx:30 | .tsx | FP | config | yes | color-mix(in_oklch,var(…)) — no hardcoded literal |
| 138 | shadcn-ui | apps/v4/styles/base-nova/ui-rtl/bubble.tsx:30 | .tsx | FP | config | yes | color-mix(in_oklch,var(…)) — no hardcoded literal |
| 139 | shadcn-ui | apps/v4/styles/base-nova/ui/bubble.tsx:30 | .tsx | FP | config | yes | color-mix(in_oklch,var(…)) — no hardcoded literal |
| 140 | shadcn-ui | apps/v4/styles/base-rhea/ui/bubble.tsx:30 | .tsx | FP | config | yes | color-mix(in_oklch,var(…)) — no hardcoded literal |
| 141 | shadcn-ui | apps/v4/styles/base-sera/ui/chart.tsx:68 | .tsx | FP | config | yes | Recharts attribute-selector override fill="#ccc" — third-party lib default; styles/ path |
| 142 | shadcn-ui | apps/v4/styles/base-vega/ui/chart.tsx:68 | .tsx | FP | config | yes | Recharts attribute-selector override — styles/ path |
| 143 | shadcn-ui | apps/v4/styles/radix-luma/ui/chart.tsx:68 | .tsx | FP | config | yes | Recharts attribute-selector override — styles/ path |
| 144 | shadcn-ui | apps/v4/styles/radix-lyra/ui/chart.tsx:68 | .tsx | FP | config | yes | Recharts attribute-selector override — styles/ path |
| 145 | shadcn-ui | apps/v4/styles/radix-maia/ui/chart.tsx:68 | .tsx | FP | config | yes | Recharts attribute-selector override — styles/ path |
| 146 | shadcn-ui | apps/v4/styles/radix-mira/ui/chart.tsx:68 | .tsx | FP | config | yes | Recharts attribute-selector override — styles/ path |
| 147 | shadcn-ui | apps/v4/styles/radix-nova/ui-rtl/chart.tsx:68 | .tsx | FP | config | yes | Recharts attribute-selector override — styles/ path |
| 148 | shadcn-ui | apps/v4/styles/radix-nova/ui/chart.tsx:68 | .tsx | FP | config | yes | Recharts attribute-selector override — styles/ path |
| 149 | shadcn-ui | apps/v4/styles/radix-rhea/ui/chart.tsx:68 | .tsx | FP | config | yes | Recharts attribute-selector override — styles/ path |
| 150 | shadcn-ui | apps/v4/styles/radix-sera/ui/chart.tsx:68 | .tsx | FP | config | yes | Recharts attribute-selector override — styles/ path |

---

## Detectable FP classes

Each of the following FP classes can be suppressed by a guard; counts are from this sample.

| fpClass | sample count | detection idea |
|---------|-------------|----------------|
| config | 60 | Skip `.yarn/` releases; skip `normalize.scss`; skip files whose primary name is `theme.ts`/`themes.ts`/`variables.scss` with a Sass variable or `@include color-variables(` context; skip `oklch(from var(…))` / `color-mix(in oklch, var(…))` matches that contain no numeric literal |
| token-def | 29 | Skip files whose basename matches `theme.ts`, `themes.ts`, `variables.scss`; or where the flagged line is inside a `@include color-variables(` block; already partially covered by `isColorTokenDefFile()` but the Sass mixin pattern is not yet handled |
| data-palette | 21 | Skip path segments: `shiki-themes`, `ColorsGenerator`, `colors-generator`, `colors-preset`; skip values inside ColorPicker component files at known hue/saturation gradient positions |
| story-test | 11 | Skip path segments: `apps/storybook/`, `.storybook/`, `@mantine-tests/`, `apps/ssr-testing/`; already partially covered but Storybook CSS/JS config files need explicit inclusion |
| svg-icon | 10 | Skip files matching `*Icon.tsx`, `*Icon.ts`; skip `fill=` / `stroke=` on SVG `<path>` elements; skip path segments `dev-icons/`, `LogoAssets/` |
| other (detectable subset) | 6 | Skip `rgba(theme.*,…)` / `rgba(parsedValue,…)` where the first argument is not a numeric literal — zero hardcoded color content; skip ColorPicker component paths for spectrum art |

## Residual non-detectable FP

**3 findings** — Discord brand hex (#5865f2, #535ed4, #4753d4) in plain component CSS files. These look structurally identical to genuine DS drift and cannot be suppressed without false-negative risk. They set a hard ceiling on achievable precision with purely structural guards.

**Achievable precision ceiling (if all detectable FP classes suppressed):** (10 TP) / (10 TP + 3 residual FP) = **77%** — still well below 90% target, meaning a semantic or content-based heuristic is also needed.
