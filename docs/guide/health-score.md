# Health Score

A single number (0–100), a CMMI-style maturity tier, and an A/B/C/Fail letter grade that summarize how closely your codebase follows its own design system — and how prepared that codebase is for coding agents (Claude, Cursor, Copilot) to ship coherent UI without re-deriving the design system from scratch.

## The formula (`scoring-v3`)

Each axis measures **adoption**: of every opportunity a rule could have
flagged on that axis, how many came out clean?

```
For each rule:  cleanᵣ = max(0, opportunitiesᵣ − findingsᵣ)

adoption  = Σ cleanᵣ / Σ opportunitiesᵣ            // across the axis's rules
axisScore = Σ cleanᵣ > 0 ? max(1, round(100 · adoption)) : 0

finalScore = round(equal-weight mean of axisScore, over axes with opportunities ≥ 30)
tier       = scoreToTier(finalScore)
             // 0–19   Foundational
             // 20–39  Managed
             // 40–59  Defined
             // 60–79  Quantitative
             // 80–100 Autonomous
grade      = bandGrade(finalScore)
             // A ≥ 80 · B ≥ 60 · C ≥ 40 · Fail < 40 — a pure band lookup, no auto-fail
```

The `max(1, …)` floor means a positive-adoption axis never rounds down to
`0` — a score of `0` is reserved for genuine zero adoption. This holds no
matter how many opportunities the axis has (the "no cliff" property): see
[`docs/architecture/scoring.md`](../architecture/scoring.md) for the full
per-rule derivation.

**Axes need at least 30 opportunities to count** (`scoring.minSampleSize` in
`.lyse.yaml`, default 30). Below that, the axis reports `insufficient sample
(n=<opportunities>) — not scored` and is excluded from the mean; at exactly
`0` opportunities it reports `not scored — no <axis> opportunities in scope`
instead. If every axis falls below the threshold, `finalScore` is `N/A`. Real
repos clear 30 opportunities per axis easily — this mainly affects tiny or
synthetic codebases.

Severity (`error`/`warning`/`info`) does **not** feed the score arithmetic in
`scoring-v3` — it drives finding display order and CI-gate policy
independently. See [`docs/architecture/scoring.md`](../architecture/scoring.md#severity-is-displayci-only-not-score).

The Health Score is the equal-weight mean of every axis that clears the
minimum sample size. Users can disable axes they don't care about via
`.lyse.yaml`.

### Previous scores are not comparable

`scoring-v3` scores are **not comparable** to scores from earlier
`scoring-v1.x` releases — the formula changed (opportunity-weighted clean
ratio, no severity weighting, no fitted constant), and a repo's number can
move by tens of points with no code change at all. The old formula stays
reachable for one minor release via `lyse audit --score-model v2` (stamps
`scoringVersion: "scoring-v1.1"`) if you need it for a migration comparison.
Every audit artifact stamps `scoringVersion`, so tooling can detect a formula
change and refuse to diff across it.

## The 6 axes

### Tokens

Are colors, spacing, typography, radii, shadows pulled from design tokens — or hardcoded? Are token files well-described and DTCG-conformant so agents can read them?

Rules on this axis:
- [`tokens/no-hardcoded-color`](../rules/tokens-no-hardcoded-color.md)
- [`tokens/no-hardcoded-spacing`](../rules/tokens-no-hardcoded-spacing.md)
- `tokens/dtcg-conformance`
- `tokens/description-coverage`

### Accessibility (a11y)

Are accessibility essentials present? Alt text, labels, ARIA, semantic HTML.

Rules on this axis:
- [`a11y/essentials`](../rules/a11y-essentials.md) — wraps `eslint-plugin-jsx-a11y`.

### Components

Are reusable components used (or are native HTML elements re-implemented), and are component / hook names predictable enough for humans and agents?

Rules on this axis:
- [`components/no-native-shadows`](../rules/components-shadow-native.md)
- [`naming/component-pascalcase`](../rules/naming-component-pascalcase.md)
- [`naming/hook-prefix`](../rules/naming-hook-prefix.md)

### Stories / documentation in code

Does each component have a corresponding Storybook story (or alternative documentation)?

Rules on this axis:
- [`stories/coverage`](../rules/storybook-coverage.md)

### AI surface

Are the machine-readable signals that coding agents rely on (AGENTS.md, component manifest, DS index export) present and well-formed?

Rules on this axis:
- `ai-surface/agents-md-quality`
- `ai-surface/component-manifest-json`
- `ai-surface/ds-index-exported`

### AI governance

Does a design system that ships AI surfaces govern them responsibly — AI-generated content marked, loading/error and live-region states present, feedback and confidence affordances, source attribution, non-human (bot) labeling, and AI-reserved tokens used only on AI surfaces? Lyse's differentiated axis. Silent on design systems with no AI surface (so non-AI systems are never penalized). See [`docs/architecture/sub-axes.md`](../architecture/sub-axes.md) for the full ai-governance sub-axis list.

#### No more early-adopter grace ramp — min-N replaced it

Earlier scoring versions ramped the ai-governance axis's *contribution* in
gradually as a design system shipped more AI markers (ADR-0018), because
without a ramp, adding a single `AIBadge` to a healthy DS would apply the
full weight of ~10 governance affordances it hadn't built yet, cratering the
score for teams just starting AI governance.

`scoring-v3` retires the ramp: the general **min-N gate** (30 opportunities,
above) is the honest replacement. A design system with only 1–2 AI markers
typically has too few `ai-governance` opportunities to clear 30 and the axis
reports `insufficient sample` rather than a volatile low number — the same
"don't crater the score on a thin sample" outcome, achieved by the same
mechanism every other axis already uses, instead of an axis-specific ramp.
`scoring.aiGovernanceGraceWindow` in `.lyse.yaml` is no longer read by the v3
scorer (still consulted by the `--score-model v2` escape hatch).

## Axis score, fields, and N/A

- **`findings`** — count of findings on this axis, after allowlists (a raw unit count — severity does not weight it).
- **`opportunities`** — code locations the rule visited (potential violation sites + compliant usages).
- **`opportunities === 0`** → axis reports `not scored — no <axis> opportunities in scope` and is excluded from the mean.
- **`0 < opportunities < 30`** → axis reports `insufficient sample (n=<opportunities>) — not scored` and is excluded from the mean.
- **`opportunities ≥ 30`** → axis is activated and contributes its score to the equal-weight mean. There are no hand-picked weights to redistribute.

## Rounding

Lyse uses `Math.round` (banker's rounding is **not** used).

`62.5` → `63`. `62.49` → `62`. `99.9` → `100`. `0.1` → `0`.

This is intentional: scores are user-facing, and conventional rounding matches reader expectations.

## Why not Math.ceil or Math.floor?

`Math.ceil` would inflate scores (62.1 → 63), making the metric a feel-good vanity number.

`Math.floor` would deflate scores (62.9 → 62), making it overly punishing.

`Math.round` is the unbiased middle.

## Determinism

Lyse default audits are **static-only**: 100% deterministic, no network, no LLM. Same input, same Health Score, byte-for-byte. The determinism gate runs in CI on every PR.

## Interpretation

Treat the score as a **conversation starter**, not a verdict.

| Score | Reading |
|---|---|
| 90+ | 🟢 Excellent. Likely a small DS with high discipline, or a mature DS with strong tooling. |
| 75–89 | 🟢 Healthy. Most production design systems live here. |
| 60–74 | 🟡 Fair. Real issues exist but are tractable. |
| 40–59 | 🟠 At risk. The DS exists but is partially aspirational. |
| 0–39 | 🔴 Critical. The DS is not enforced — or you don't have one yet. |

A low score is not a moral failing — it's a starting position. The trend over the next 6 months matters more than the absolute number.

## What the Health Score does NOT measure

### Out of scope (other tools cover these)

- **Visual fidelity** — that's Chromatic / Percy / Argos.
- **Code quality** — that's ESLint / Sonar / Codacy.
- **Bundle size** — that's Bundlewatch / size-limit.
- **Runtime performance** — that's Lighthouse / WebPageTest.
- **User experience** — that's actual users.

The Health Score is a structural metric for design system adherence. Use it alongside the others, not instead of them.

### Coverage by axis

Lyse ships **66 deterministic static rules across 6 axes**. Default audits are static-only — no LLM, no network.

| Axis | Rules | Notes |
|---|---|---|
| Tokens | `tokens/no-hardcoded-color`, `tokens/no-hardcoded-spacing`, `tokens/dtcg-conformance`, `tokens/description-coverage` | Foundational layer; conformance + description coverage make token files machine-readable for agents |
| A11y | `a11y/essentials` | Wraps `eslint-plugin-jsx-a11y`; contrast WCAG requires a browser engine |
| Components | `components/no-native-shadows`, `naming/component-pascalcase`, `naming/hook-prefix` | Reusable components over native HTML + predictable identifier conventions |
| Stories | `stories/coverage` | Storybook or alternative documentation per component |
| AI surface | `ai-surface/agents-md-quality`, `ai-surface/component-manifest-json`, `ai-surface/ds-index-exported` | Machine-readable signals coding agents rely on |
| AI governance | `ai-governance/ai-content-live-region`, `ai-governance/ai-loading-error-states`, `ai-governance/ai-marker-component-present`, `ai-governance/confidence-indicator-present`, `ai-governance/bot-identity-labeling`, `ai-governance/draft-attribution`, `ai-governance/interaction-pattern-docs`, `ai-governance/ai-token-misuse`, `ai-governance/product-analytics`, `ai-governance/source-attribution-present`, `ai-governance/feedback-control-present` | Governs AI surfaces responsibly; silent (min-N excluded) until a design system has enough AI-surface opportunities to score (see min-N above) |

Each rule contributes 1 sub-axis to the reliability catalogue (66 sub-axes total, 52 currently `stable` and scored). The full catalogue lives at [`docs/architecture/sub-axes.md`](../architecture/sub-axes.md); promotion to `stable` requires N ≥ 40 independently-provenanced samples + Wilson 95 % LB ≥ 0.90 on recall (and ≥ 0.90 on precision to contribute to the score).

Known limitations:

1. **Contrast WCAG** is not measured — `a11y/essentials` wraps `eslint-plugin-jsx-a11y` only. Full WCAG-ratio coverage waits on a browser engine integration (planned, Playwright + axe-core).
2. **No LLM augmentation by default.** Default audits are fully static; areas like themes, motion, deep documentation, and cross-platform parity are out of scope for the static pipeline.
3. **Provisional gold set.** The calibration corpus is small and community re-labels via the public `lyse-bench` repo supersede the seed annotations.
4. **`ai-governance` can read misleadingly high (~100) on a repo with no real AI surface.** Its opportunity denominator is currently structural (project-level presence checks), so a repo with zero AI-surface findings and a large denominator scores near-perfect adoption by default rather than N/A — a graph-derived denominator that scales with actual AI-surface size is planned for a later phase. Don't read a lone 100 on `ai-governance` as "this DS governs AI well"; check whether it ships an AI surface at all first.

## Compliance counters and cross-repo comparison

Several rules ship with **compliance counters** that recognize Tailwind utility classes, `var(--token-name)` references, and theme function calls as compliant token usage. This adds thousands of "compliant usage" hits to the denominator on utility-first codebases — a higher score reflects genuine discipline, not a missed finding.

This makes cross-repo comparisons fragile. Tracking your repo's Health Score **over time** is meaningful; comparing scores **across different repos** is less so because their `opportunities` populations and compliance-counter paradigms differ.

**Below 30 opportunities, an axis doesn't score at all** — the min-N gate
excludes it from the mean rather than let a handful of samples swing the
number (see [The formula](#the-formula-scoring-v3) above). This is a hard
cutoff, not a soft noise warning: a tiny or synthetic repo can legitimately
report `finalScore: N/A` if every axis falls short.

**Honest caveat on the score distribution.** Because the model measures a
clean-adoption ratio rather than a severity-weighted penalty, scores across
real-world repos compress toward the high 70s–90s more than under earlier
scoring versions — most production codebases have a high (if imperfect)
adoption ratio on any axis with real opportunities, and the min-N gate drops
out the volatile small-sample axes that used to pull scores down. A score in
that range does not mean "no drift"; check the per-axis and per-finding
detail before treating a high number as a clean bill of health.

## Trend over time

The most useful comparison is the same repo over time. Plot the score across the last 30 commits to main, and watch the trend.

You can run `lyse audit --format=json` in a cron job and append to a CSV to track the trend.

## See also

- [Rules index](../rules/) — the 66 deterministic static rules that compose the audit.
- [Configuration](./configuration.md) — disable rules, override severities.
- [Reliability](../architecture/reliability.md) — reliability pillars + version-pinned scoring.
- [Calibration](../architecture/calibration.md) — calibration corpus and methodology.
- [FAQ](./faq.md) — common questions about the score.
