# Scoring

How rule findings become a Health Score.

## Two-stage compute

```
findings (per severity) + opportunities per axis
            │
            ▼
   weightedFindings = 4·errors + 2·warnings + 1·infos
   rateScore        = max(0, 100 · (1 − weightedFindings / opportunities))
   absoluteCap      = 100 − K · log10(1 + weightedFindings)
   axisScore        = min(rateScore, absoluteCap)
            │
            ▼
   finalScore = equal-weight mean of axisScore across active axes
            │
            ▼
   round to integer
```

## Stage 1 — per-axis score

For each of the 6 axes (`tokens`, `a11y`, `components`, `stories`, `ai-surface`, `ai-governance`):

```ts
const weightedFindings = 4 * errors + 2 * warnings + 1 * infos;

const axisScore =
  opportunities === 0
    ? null                                                    // N/A
    : Math.min(
        Math.max(0, 100 * (1 - weightedFindings / opportunities)), // rateScore
        100 - K * Math.log10(1 + weightedFindings),                // absoluteCap
      );
```

Where:
- **errors / warnings / infos** = count of findings on this axis per severity, after allowlists.
- **opportunities** = count of code locations the rule visited and *could* have flagged.
- **K** = global calibration constant (currently `0`; the cap slot is preserved for future re-fits).

Severity weighting (4 / 2 / 1) ensures that one broken-semantic-token `error` is not equivalent to one missing-description `info`. The `min(rateScore, absoluteCap)` structure preserves future flexibility — even at `K = 0` the cap slot exists in every audit artifact (`absoluteCap` field).

### Why divide by opportunities, not by file count

`opportunities` (per-rule denominators) normalize for project size. A rule that visits 100 color expressions and finds 10 hardcoded ones scores the same regardless of total file count. Dividing by file count instead would penalize small repos and reward large ones for the same drift density.

### What counts as an opportunity per rule

| Rule | Opportunities = |
|---|---|
| `tokens/no-hardcoded-color` | Every color expression encountered (literal or token reference). |
| `tokens/no-hardcoded-spacing` | Every spacing expression encountered (padding/margin/gap values). |
| `components/no-native-shadows` | Every JSX tag opening seen that has a known native HTML name. |
| `a11y/essentials` | Every JSX tag opening seen (every tag is an opportunity for a11y checks). |
| `stories/coverage` | Every detected component file. |
| `naming/component-pascalcase`, `naming/hook-prefix` | Every relevant exported identifier seen. |
| `ai-surface/*` | The presence (or absence) of the relevant project-level signal (AGENTS.md, manifest, exported DS index). |

Each rule's visitor increments the opportunity count as it visits, regardless of whether it emits a finding.

## Stage 2 — equal-weight mean over active axes

```ts
const activeAxes = axisScores.filter((s) => s !== null);
const finalScore = activeAxes.length === 0
  ? null
  : Math.round(activeAxes.reduce((a, b) => a + b, 0) / activeAxes.length);
```

Examples:

### One axis N/A (e.g., no Storybook)

```
active = { tokens, a11y, components, ai-surface }  // 4 of 6 axes (stories, ai-governance N/A)
final  = (tokens + a11y + components + ai-surface) / 4
```

### Only two axes have data

```
active = { tokens, a11y }
final  = (tokens + a11y) / 2
```

### All axes N/A (no relevant code)

The audit returns `finalScore: null` and exits with a warning to the user.

## Why equal weights

Lyse ships with equal axis weights (1/N over active axes). Hand-picked axis weights bias the score toward whatever the author cares about; equal weights make the score a clean structural metric and let users opt out of axes they don't care about via `.lyse.yaml`.

Severity weighting (errors 4×, warnings 2×, infos 1×) does the work that axis weighting could do: it differentiates a repo with 100 broken-token errors from a repo with 100 missing-descriptions info findings, without imposing a non-defensible axis priority.

## Stage 3 — rounding

```ts
const final = Math.round(weighted);
```

Lyse uses `Math.round`. Not `Math.ceil` (would inflate scores). Not `Math.floor` (would deflate). Not banker's rounding (less intuitive).

`62.5` → `63`. `62.49` → `62`. `99.9` → `100`. `0.1` → `0`.

## Determinism

The scorer is a pure function of its inputs:

- Findings (deterministic per [`rules-engine.md`](./rules-engine.md)).
- Opportunities (deterministic — visitors are repeatable).
- `K` (constant per scoring version).

Run the audit twice on the same code: same score.

## Edge cases

### A rule contributing to no axis-relevant findings

If a rule visits files but emits no findings AND records opportunities, the axis improves (denominator grows, numerator stays).

### A rule that emits findings but doesn't record opportunities

This would be a bug — the score becomes ill-defined. The rule runner asserts in development that `weightedFindings ≤ 4 · opportunities` (the upper bound when every finding is an error, severity-weighted 4×).

### Allowlisted findings

Recorded in the result with `severity: "off"` but excluded from the severity counts for scoring purposes.

## Score's verbal interpretation

Documented in [`health-score.md`](../guide/health-score.md) for users; reproduced here for engine context:

| Score | Reading |
|---|---|
| 90+ | Excellent. |
| 75–89 | Healthy. |
| 60–74 | Average. |
| 40–59 | Significant drift. |
| 0–39 | DS not enforced. |

These are not formal thresholds in code — they're communication aids.

## See also

- [`health-score.md`](../guide/health-score.md) — user-facing formula documentation.
- [`rules-engine.md`](./rules-engine.md) — how findings are produced.
- `packages/core/src/scorer.ts` — implementation.
