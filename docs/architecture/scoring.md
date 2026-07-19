# Scoring

How rule findings become a Health Score.

**This page documents `scoring-v3`, the default since this Health Score
release.** Scores from earlier `scoring-v1.x` releases are **not comparable**
to `scoring-v3` scores — see [Comparability](#comparability-with-earlier-scores)
below. The legacy formula stays reachable for one minor release via
`--score-model v2` (see [Escape hatch](#escape-hatch----score-model-v2)).

## The adoption-ratio model

```
findings + opportunities, per rule
            │
            ▼
   cleanᵣ  = max(0, oppᵣ − findingsᵣ)                     // per rule
            │
            ▼
   adoption   = Σ cleanᵣ / Σ oppᵣ                          // per axis, over its rules
   axisScore  = Σ cleanᵣ > 0 ? max(1, round(100·adoption)) : 0
            │
            ▼
   activated axes = axes with opportunities ≥ minSampleSize (default 30)
   finalScore     = round(equal-weight mean of activated-axis scores)
            │
            ▼
   tier  = scoreToTier(finalScore)
   grade = bandGrade(finalScore)     // pure band lookup, no auto-fail
```

Severity (`error`/`warning`/`info`) does **not** enter this arithmetic. It
still drives display ordering (which findings surface first) and CI-gate
policy (`lyse add ci-gate` can gate on severity independently of the score) —
see [Severity is display/CI only](#severity-is-displayci-only-not-score).

## Stage 1 — per-rule clean count, then per-axis adoption

For each rule that recorded opportunities:

```ts
const clean = Math.max(0, opportunities - findings); // per rule, floored at 0
```

`findings` is a **raw unit count** — one finding is one finding, regardless of
severity. A rule that visited 100 locations and flagged 12 has `clean = 88`.

Per axis, these are aggregated as sums across every rule reporting on that
axis:

```ts
const totalClean = Σ cleanᵣ;    // sum over the axis's rules
const totalOpp   = Σ oppᵣ;      // sum over the axis's rules
const adoption   = totalClean / totalOpp;
```

Because each rule's `cleanᵣ` and `oppᵣ` are summed before dividing, `adoption`
is an **opportunity-weighted mean** of the individual rules' adoption ratios —
a rule with 10,000 opportunities influences the axis proportionally more than
a rule with 10. This is deliberate: a rule that rarely applies shouldn't move
the axis as much as one that fires constantly across the codebase.

### The `max(1, …)` floor — "no cliff" guarantee

```ts
const axisScore = totalClean > 0 ? Math.max(1, Math.round(100 * adoption)) : 0;
```

If **any** opportunity on the axis is clean (`totalClean > 0`), the axis score
can never round down to `0` — it floors at `1`. A score of exactly `0` is
therefore reserved for genuine zero adoption (every single opportunity on the
axis produced a finding). Without this floor, an axis with thousands of
opportunities and near-total but not perfect adoption (e.g. `2 / 4000` clean)
would round to `0` under naive `Math.round`, indistinguishable from a repo
that got everything wrong. The floor holds at every opportunity count — this
is what "no cliff" means: there is no volume of opportunities at which a
mostly-clean axis can be misread as a totally-failing one.

### What counts as an opportunity per rule

Unchanged from earlier scoring versions — `opportunities` are the code
locations a rule visited and *could* have flagged, whether or not it did:

| Rule | Opportunities = |
|---|---|
| `tokens/no-hardcoded-color` | Every color expression encountered (literal or token reference). |
| `tokens/no-hardcoded-spacing` | Every spacing expression encountered (padding/margin/gap values). |
| `components/no-native-shadows` | Every JSX tag opening seen that has a known native HTML name. |
| `a11y/essentials` | Every JSX tag opening seen (every tag is an opportunity for a11y checks). |
| `stories/coverage` | Every detected component file. |
| `naming/component-pascalcase`, `naming/hook-prefix` | Every relevant exported identifier seen. |
| `ai-surface/*` | The presence (or absence) of the relevant project-level signal (AGENTS.md, manifest, exported DS index). |

Each rule's visitor increments the opportunity count as it visits, regardless
of whether it emits a finding.

### Why divide by opportunities, not by file count

`opportunities` (per-rule denominators) normalize for project size. A rule
that visits 100 color expressions and finds 10 hardcoded ones scores the same
regardless of total file count. Dividing by file count instead would penalize
small repos and reward large ones for the same drift density.

## Stage 2 — min-N activation

An axis only enters the final mean once it has enough opportunities to be
statistically meaningful:

```ts
const MIN_SAMPLE_SIZE = 30; // config: scoring.minSampleSize

if (opportunities < MIN_SAMPLE_SIZE) {
  // axis is not activated — excluded from the final mean
}
```

Two distinct N/A states, both excluded from the final mean but reported
differently:

- **`opportunities === 0`** → `<axis>: not scored — no <axis> opportunities in scope.`
  There is nothing on this axis to measure at all (e.g. no Storybook →
  `stories` axis has zero opportunities).
- **`0 < opportunities < minSampleSize`** → `<axis>: insufficient sample (n=<opportunities>) — not scored.`
  The axis has *some* signal, but not enough of it to trust a ratio (e.g. a
  tiny fixture repo with 8 color expressions total).

`scoring.minSampleSize` in `.lyse.yaml` overrides the default of 30 — lower it
for small/synthetic repos at your own risk (below ~30 samples, a single
finding swings the ratio by several points).

## Stage 3 — equal-weight mean over activated axes

```ts
const activated = axisScores.filter((axis) => axis.opportunities >= minSampleSize);
const finalScore = activated.length === 0
  ? "N/A"
  : Math.round(activated.reduce((sum, a) => sum + a.score, 0) / activated.length);
```

Examples:

### One axis below min-N (e.g. a small repo's `stories` axis)

```
activated = { tokens, a11y, components, ai-surface }  // 4 of 6 axes; stories below min-N
final     = (tokens + a11y + components + ai-surface) / 4
```

### Every axis below min-N (tiny/synthetic repo)

The audit returns `finalScore: "N/A"` and `tier: "N/A"`. This is expected and
correct on small fixtures — real repos clear 30 opportunities per axis
easily. Lyse's own `fixtures/full-ds` smoke fixture is a worked example: every
axis has fewer than 30 opportunities, so the whole audit reports `N/A` under
`scoring-v3` (it scored a number, `37`, under the old `scoring-v1.1` formula —
see [Comparability](#comparability-with-earlier-scores)).

## Why equal weights

Lyse ships with equal axis weights (1/N over activated axes). Hand-picked
axis weights bias the score toward whatever the author cares about; equal
weights make the score a clean structural metric and let users opt out of
axes they don't care about via `.lyse.yaml`.

## Severity is display/CI only, not score

Severity (`error` / `warning` / `info`) no longer participates in the score
arithmetic — a `tokens/no-hardcoded-color` `error` and an
`ai-surface/component-manifest-json` `info` each count as exactly one finding
against their rule's `clean` count. Severity still matters for two things
Lyse does independently of the number:

1. **Display priority** — findings render most-severe-first in the terminal
   report and JSON/SARIF output.
2. **CI-gate policy** — `lyse add ci-gate` can be configured to fail a PR on
   any `error`-severity finding regardless of the aggregate score moving.

This is a deliberate simplification from earlier scoring versions, which
severity-weighted findings (4× errors / 2× warnings / 1× infos) directly into
the score. Under `scoring-v3`, "how bad is a finding" and "how much does the
score move" are two separate questions.

## Grade — pure band lookup

```ts
function bandGrade(score: number): Grade {
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  return "Fail";
}
```

`finalScore === "N/A"` maps to grade `"N/A"`. There is no auto-fail rule
anymore (earlier versions failed a repo whenever ≥2 axes scored exactly 0,
even if the numeric mean was high) — the grade is derived from the score by a
straight band lookup, so the number, tier, and grade are always mutually
consistent by construction.

## Rounding

Lyse uses `Math.round`. Not `Math.ceil` (would inflate scores). Not
`Math.floor` (would deflate). Not banker's rounding (less intuitive).

`62.5` → `63`. `62.49` → `62`. `99.9` → `100`. `0.1` → `0`.

## Determinism

The scorer is a pure function of its inputs:

- Findings (deterministic per [`rules-engine.md`](./rules-engine.md)).
- Opportunities (deterministic — visitors are repeatable).
- `minSampleSize` (config value, held constant for the run).

Run the audit twice on the same code: same score.

## Edge cases

### A rule contributing to no findings

If a rule visits locations but emits no findings AND records opportunities,
the axis improves (`totalClean` grows toward `totalOpp`, `adoption` → 1).

### A rule that emits findings but doesn't record opportunities

This would be a bug — the score becomes ill-defined (`clean` could go
negative before the `max(0, …)` floor absorbs it, silently masking the
mistake). Treat any rule with `findings > 0` and `opportunities === 0` as a
rule-implementation defect to fix, not a legitimate axis state.

### Allowlisted findings

Recorded in the result with `severity: "off"` but excluded from the finding
counts used for scoring purposes — an allowlisted usage counts as `clean`.

## Escape hatch: `--score-model v2`

The previous severity-weighted formula (`weightedFindings` / `rateScore` /
`absoluteCap` / the log-scaled `K` constant / the `FAIL_CAP = 39` auto-fail
cap / the ≥2-axes-at-0 grade auto-fail) is retired from the default path but
stays reachable, byte-for-byte, for one minor release as a migration aid:

```bash
lyse audit --score-model v2
# or: LYSE_SCORE_MODEL=v2 lyse audit
# or, in .lyse.yaml:
#   scoring:
#     model: v2
```

Precedence: CLI flag > env var > config file > default (`v3`). Running under
`v2` stamps `scoringVersion: "scoring-v1.1"` and `schemaVersion: 2` — the same
values earlier releases stamped — so tooling that branches on
`scoringVersion` can detect which formula produced a given artifact.
`--score-model v2` is planned for removal after one minor release; pin your
CI to a specific Lyse version if you depend on it past that window.

## Comparability with earlier scores

**`scoring-v3` scores are not comparable to `scoring-v1.x` scores.** The
formulas measure different things (opportunity-weighted clean-adoption ratio
vs. severity-weighted penalty against a log-capped baseline) and can move a
repo's number by tens of points in either direction with no change to the
underlying code. Do not diff a `scoring-v3` score against a
`scoring-v1.x` score from before this release and read the delta as drift —
re-baseline instead. Every emitted audit artifact stamps `scoringVersion` so
tooling can detect a formula change and refuse to compare across it.

## What "the score got more honest" means, concretely

Two pre-existing false negatives were also fixed as part of this release
(Design System Graph zone-awareness — see [`rules-engine.md`](./rules-engine.md)),
and their effect is much more visible under the adoption-ratio model than it
was under the old severity/log-cap formula:

- **`carbon-react` `tokens` axis: `1` → `77`.** The old formula's log-scaled
  cap kept a repo with any nonzero drift near the floor regardless of how
  small the drift was relative to opportunities; the new ratio directly
  reflects "how much of this axis is clean," so fixing the token-scale false
  positives moves the axis score by the full proportional amount.
- **`shadcn-ui` `components` axis: `0` → `66`.** Same shape of fix (a false
  "no design-system components used" reading caused by unrecognized
  registry/theme-variant paths), same proportional payoff once corrected.

These are not scoring-formula artifacts — they are the score becoming an
honest reflection of drift that was always there (or, in these two cases, was
being miscounted). The full golden-corpus deltas are in the
[CHANGELOG](../../CHANGELOG.md).

## Score's verbal interpretation

Documented in [`health-score.md`](../guide/health-score.md) for users;
reproduced here for engine context:

| Score | Reading |
|---|---|
| 90+ | Excellent. |
| 75–89 | Healthy. |
| 60–74 | Average. |
| 40–59 | Significant drift. |
| 0–39 | DS not enforced. |

These are not formal thresholds in code — they're communication aids.

## Scoring semver policy

The Health Score is a **public contract**. Consumers pin it via `scoringVersion`
in the audit output (the `CURRENT_SCORING_VERSION` constant).

- **Any change to a score output** — the `finalScore` formula, axis weighting,
  grade thresholds, min-N gate, or tier banding — is a **semver-major**
  change to the score, even when the JSON schema is unchanged.
- Such a change MUST: (1) bump `CURRENT_SCORING_VERSION`, and (2) add a new
  entry to the `LOCKED` table in `packages/core/tests/scoring-contract.test.ts`
  keyed by the new version. Never edit an existing version's locked values —
  the `scoring-v1`, `scoring-v1.1`, and `scoring-v3` rows all remain in that
  table, each locking the historical output of its own formula.
- The contract test turns any silent score drift into a CI failure, forcing the
  bump-or-revert decision to be explicit.
- Consumers (CI score thresholds, dashboards, telemetry) should re-baseline when
  `scoringVersion` changes — a changed version signals "the same input may now
  score differently."

Lyse's banded-grade structure follows the pattern of published industry
scorecards such as Microsoft's Fluent 2 Responsible-AI scorecard — a
methodology reference, not a product dependency.

## See also

- [`health-score.md`](../guide/health-score.md) — user-facing formula documentation.
- [`rules-engine.md`](./rules-engine.md) — how findings are produced.
- `packages/core/src/scorer.ts` / `packages/core/src/scorer-v3.ts` — implementation.
