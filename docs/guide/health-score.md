# Health Score

A single number (0–100) plus a CMMI-style maturity tier that summarize how closely your codebase follows its own design system — and how prepared that codebase is for coding agents (Claude, Cursor, Copilot) to ship coherent UI without re-deriving the design system from scratch.

## The formula (`scoring-v1`)

For each axis with `opportunities > 0`:

```
weightedFindings = 4·errorCount + 2·warningCount + 1·infoCount
rateScore        = max(0, 100 · (1 − weightedFindings / opportunities))
absoluteCap      = 100 − K · log10(1 + weightedFindings)
axisScore        = min(rateScore, absoluteCap)

finalScore = equal-weight mean of axisScore across active axes (opportunities > 0)
tier       = scoreToTier(finalScore)
             // 0–19   Foundational
             // 20–39  Managed
             // 40–59  Defined
             // 60–79  Quantitative
             // 80–100 Autonomous
```

`K` is calibrated against a public 8-repo corpus. Current calibrated value: **K = 0** (rounded from 0.048); LOO MAE = **10.36 pts**. The cap slot is preserved structurally so future re-fits can drop in without a migration.

The Health Score is the equal-weight mean of every active axis (axes with `opportunities > 0`). Users can disable axes they don't care about via `.lyse.yaml`.

## The 5 axes

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

## Axis score, fields, and N/A

- **`errorCount` / `warningCount` / `infoCount`** — findings on this axis per severity, after allowlists.
- **`opportunities`** — code locations the rule visited (potential violation sites + compliant usages).
- **`K`** — global calibration constant (currently 0; the cap slot is preserved so future re-fits drop in without a migration).
- **`opportunities == 0`** → axis is N/A and excluded from the equal-weight mean. There are no hand-picked weights to redistribute.

Severity weighting (4 / 2 / 1) ensures one broken-token `error` is not equivalent to one missing-description `info`.

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

Lyse ships **12 deterministic static rules across 5 axes**. Default audits are static-only — no LLM, no network.

| Axis | Rules | Notes |
|---|---|---|
| Tokens | `tokens/no-hardcoded-color`, `tokens/no-hardcoded-spacing`, `tokens/dtcg-conformance`, `tokens/description-coverage` | Foundational layer; conformance + description coverage make token files machine-readable for agents |
| A11y | `a11y/essentials` | Wraps `eslint-plugin-jsx-a11y`; contrast WCAG requires a browser engine |
| Components | `components/no-native-shadows`, `naming/component-pascalcase`, `naming/hook-prefix` | Reusable components over native HTML + predictable identifier conventions |
| Stories | `stories/coverage` | Storybook or alternative documentation per component |
| AI surface | `ai-surface/agents-md-quality`, `ai-surface/component-manifest-json`, `ai-surface/ds-index-exported` | Machine-readable signals coding agents rely on |

Each rule contributes 1 sub-axis to the reliability catalogue (12 sub-axes total). The full catalogue lives at [`docs/architecture/sub-axes.md`](../architecture/sub-axes.md); promotion to `stable` requires N ≥ 30 hand-labelled samples + Wilson 95 % LB ≥ 0.90 on recall.

Known limitations:

1. **Contrast WCAG** is not measured — `a11y/essentials` wraps `eslint-plugin-jsx-a11y` only. Full WCAG-ratio coverage waits on a browser engine integration (planned, Playwright + axe-core).
2. **No LLM augmentation by default.** Default audits are fully static; areas like themes, motion, deep documentation, and cross-platform parity are out of scope for the static pipeline.
3. **Provisional gold set.** The calibration corpus is small and community re-labels via the public `lyse-bench` repo supersede the seed annotations.

## Compliance counters and cross-repo comparison

Several rules ship with **compliance counters** that recognize Tailwind utility classes, `var(--token-name)` references, and theme function calls as compliant token usage. This adds thousands of "compliant usage" hits to the denominator on utility-first codebases — a higher score reflects genuine discipline, not a missed finding.

This makes cross-repo comparisons fragile. Tracking your repo's Health Score **over time** is meaningful; comparing scores **across different repos** is less so because their `opportunities` populations and compliance-counter paradigms differ. At very small counts (< 50 opportunities) scores get noisy — don't over-interpret a 7-point swing on a tiny codebase.

## Trend over time

The most useful comparison is the same repo over time. Plot the score across the last 30 commits to main, and watch the trend.

You can run `lyse audit --format=json` in a cron job and append to a CSV to track the trend.

## See also

- [Rules index](../rules/) — the 12 deterministic static rules that compose the audit.
- [Configuration](./configuration.md) — disable rules, override severities.
- [Reliability](../architecture/reliability.md) — reliability pillars + version-pinned scoring.
- [Calibration](../architecture/calibration.md) — calibration corpus and methodology.
- [FAQ](./faq.md) — common questions about the score.
