---
"@lyse-labs/lyse": minor
---

Component inventory accuracy: three root causes fixed, and the Health Score moves on real design systems as a direct, disclosed consequence.

1. **Per-component module attribution.** Every component in a monorepo was labelled with a single package name — on Twilio Paste, all 1109 components claimed `@twilio-paste/icons`, 770 (69%) wrongly. Each component now resolves to its own workspace package via a bounded nearest-ancestor `package.json` walk. Measured: **1 → 98 distinct modules** (`Button` → `@twilio-paste/button`). `chakra-ui`, a genuinely single-package DS, correctly stays at 2.
2. **Nested doc/demo-site excludes.** `DEFAULT_EXCLUDE_PATHS` was root-anchored, so `packages/paste-website/**` was scanned as design-system source — 281 marketing/docs files counted as components. Measured: **1109 → 828 components**, website-ish sample → 0, real components (`Button`, `Modal`, `Table`) still present; a test pins that `packages/website-ui/**` is not over-excluded.
3. **`forwardRef`/`memo` prop extraction.** `extractComponentProps` matched only plain and arrow functions, so any component wrapped in `React.forwardRef` — the standard pattern for a component library — yielded zero props. Measured: **~46 → 664 of 828 components** now report ≥1 prop.

**Health Score, `lyse audit --static-only`, before (`main`) → after (this branch):**

| repo | score | findings |
|---|---|---|
| paste | **96 → 73** | 269 → 298 |
| vuetify | **84 → 79** | 78 → 63 |
| shadcn-svelte | 98 → 98 | 21 → 21 |
| chakra-ui | 84 → 84 | 106 → 106 |

`paste` drops 23 points because the `stories` axis went from `N/A` (2 opportunities, below the min-sample threshold) to a real **2/100** on 48 opportunities — Lyse now correctly identifies 48 DS components instead of ~2. The 47 findings (`stories/props-documented`, "has a story that documents no props") are verifiably true: of Paste's 204 `.stories.tsx` files, only 3 contain `argTypes` and 0 contain `args:`. `a11y` improved over the same run (95 → 97) — this is Lyse measuring an axis it was previously blind to, not a regression.

Gates verified: full suite 3897 passed / 0 failed; `packages/core/rules-manifest.json` byte-identical (no rule added or removed); `validate:autonomous` → `ENGINE GATE PASS` (52 rules, all J=1).

**Known defects that remain open** — this is a reduction in error, not a claim of correctness:
- One component name per *file*, never per *export* (`ModalDialogOverlay`, `ModalDialogContent` still missing).
- Cross-package name collisions silently dedup (26 observed in Paste).
- YAML token sources unsupported — Paste's 135 `.yml` token files remain invisible; its `tokenSetHash` is still the hash of an empty token set.
- `forwardRef` generic type arguments are not read, so props are mostly recovered from destructuring defaults — `AcceptIcon` gets 1 prop, not its real 7.
- `storyCount` counts story *files*, not story exports.
