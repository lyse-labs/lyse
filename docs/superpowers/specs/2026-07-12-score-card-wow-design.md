# Score card — the screenshotable audit report — Design

**Goal:** When someone screenshots `lyse audit`, the natural frame is a
single compact card: the Health Score, grade, delta, and the six axis
bars. Legible even as a Twitter thumbnail. No Health Score change.

**Decisions taken with the maintainer:** the wow moment is a **score
card** (chosen over whole-report polish and card+findings variants).
Remaining decisions below were made by the implementer and are open to
review.

## What the card replaces

The card **absorbs** the current score line and the per-axis bar section
of the default terminal view (zero redundancy). The report becomes:

```
◈ lyse 0.2.0  ·  247 files · 1.4s

╭──────────────────────────────────────────────────────────╮
│                                                          │
│   ● B   43/100   design system health          ▼ 2       │
│   ████████▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░                 │
│                                                          │
│   ✘ tokens          31  ██████░░░░░░░░░░░░░░              │
│   ⚠ a11y            62  ████████████░░░░░░░░              │
│   ✘ components      38  ████████░░░░░░░░░░░░              │
│   ⚠ stories         47  █████████░░░░░░░░░░░              │
│   ⚠ ai-surface      55  ███████████░░░░░░░░░              │
│   ● ai-governance    —  ░░░░░░░░░░░░░░░░░░░░              │
│                                                          │
╰──────────────────────────────────────────────────────────╯

  Top findings
  …
```

(Illustrative: exact spacing determined by implementation; the wide
gauge bar under the score is 40 cells; the axis rows reuse the existing
`axisLine` composition at their current bar width.)

Everything else in the view is unchanged: banner above, Layer-4 banners
and the no-token-registry nag (which move to directly BELOW the card),
Top findings, Next steps, coverage footer, footer.

## Rendering rules

- **New module** `src/reporters/score-card.ts`, exporting
  `renderScoreCard(result, opts): string[]`. `renderTerminal` composes
  it; `renderTable`, `--format=eslint`, JSON/SARIF/HTML untouched.
- **Score emphasis by weight, not ASCII-art:** the score renders as
  `<status-dot> <grade>  <score>/100` in bold + threshold color, plus a
  40-cell gauge bar. ASCII-art digits were rejected: fragile across
  fonts/locales and hostile to screen readers reading a TTY transcript.
- **Borders:** rounded box-drawing (`╭─╮ │ ╰─╯`) when `opts.unicode`,
  `+--+ | +--+` ASCII fallback otherwise. Bars/glyphs already degrade
  via `ui/tokens` GLYPH pairs.
- **Width:** card outer width = `min(64, opts.width)`, minimum 44.
  Content lines are padded with the width-aware `visiblePad` (ANSI-safe);
  no OSC-8 hyperlinks inside the card (border alignment risk).
- **Delta:** the existing ▲/▼ vs the previous audit renders right-aligned
  on the score row (reuses the current history/computeDelta path).
- **N/A axes** render as today (muted dot, `—`, empty bar) inside the
  card. `finalScore === "N/A"` renders the card with `N/A` and no gauge
  fill. Auto-fail keeps its `(auto-fail)` marker after the grade.
- **Quiet mode** shows banner + card only (it already suppressed
  findings/next-steps; the card replaces exactly what quiet kept).

## Constraints

- **No score change** — display only; scorer/pipeline untouched.
- Strict TS; no new dependencies; English artifacts.
- The vitest suite cannot run in this environment (npm registry blocked):
  the snapshot is updated by hand and **byte-verified** by executing the
  real renderer through the tsc sandbox harness, as done for Wave 1.
  CI must gate the PR.

## Testing

- Unit tests for `renderScoreCard`: unicode + ascii borders, width
  clamping (narrow terminal), N/A final score, auto-fail, delta row,
  6-axis rows, no-ANSI-in-`color:false` mode.
- `renderTerminal` snapshot updated (hand-computed, byte-verified) +
  assertions: card present, old bare axis section absent, findings and
  next steps unchanged below.

## Out of scope

- Any change to `--format=table`/`eslint`/machine formats.
- The leaderboard / launch assets (next chantier).
- History schema (still 4 axes — separate follow-up, already logged).
