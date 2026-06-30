# Sub-project A — "Honest measurement foundation" — Design

> Status: **design / awaiting plan**. First of four sub-projects (A → B → C → D)
> rebalancing Lyse toward the agent-oriented imperative baseline. This spec
> covers **A only**. B (components reuse layer), C (a11y + docs), D (ai-governance
> pruning + scoring v3) and the deferred Figma axis are out of scope here.

## Goal

Make every reliability number Lyse publishes **honest, per-rule, and
reproducible in-repo** — backed by a real sample count (`N`), derived from an
adversarial fixture corpus rather than hand-pasted constants — and bring the
three under-measured detectors (`tokens/no-hardcoded-color`,
`tokens/no-hardcoded-shadow`, `components/contracts-strictness`) to a measured
SLO. **No change to the score contract**: status flips are deferred to the
single deliberate `scoring-v2 → v3` bump in sub-project D.

## Why

An external audit aggregating ~600 expert reviews, verified line-by-line against
this codebase, surfaced two credibility defects and one broken flagship rule:

1. **Wilson bounds without N.** `docs/architecture/per-rule-slo.md` prints a
   Wilson lower bound per rule but the sample count column is `—` everywhere.
   A confidence bound with no N is not falsifiable.
2. **Repeated constants read as seeding.** 28 sub-axes share the exact Wilson LB
   `0.9010990076755959`; 8 more share `0.9035813714055363`. These come from a
   single fixed-N synthetic suite applied uniformly. A sophisticated reader
   concludes the numbers are manufactured.
3. **The flagship `tokens/no-hardcoded-color` is at 44.3 % precision**,
   experimental, excluded from the score — while the marketing narrative leans
   on exactly this kind of semantic detection.

Closing these is cheap (no new infrastructure, no network, no scoring break) and
is the credibility foundation every later sub-project inherits.

## Current state (what already exists — reuse, do not reinvent)

- **Autonomous validation engine** (`packages/core/validation/run.ts`, script
  `pnpm validate:autonomous`). Per rule it builds a **confusion matrix**
  (`tp/fp/tn/fn`) from a clean fixture + `MutationOperator[]` (each mutation
  injects one known violation = a labelled positive) + metamorphic pairs, then
  computes **Youden's J**. CI-gated to `J=1` via `engineGateFailures()`.
  - Adapters: `packages/core/validation/adapters/*.ts` (47 adapters / 65 rules).
  - Factories: `hardcoded-value-adapters.ts` (`makeHardcodedValueAdapter`),
    `generic-presence-adapters.ts` (`makePresenceAdapter`).
  - Confusion-matrix + J logic: `packages/core/validation/score.ts`,
    `run-adapter.ts`. Output: `packages/core/validation/report.json`.
- **Wilson lower bound**: `wilsonLowerBound(successes, trials, confidence=0.95)`
  in `packages/core/src/reliability/catalogue/promotion.ts`.
- **Confusion → precision/recall + Wilson**: already done in
  `packages/core/src/reliability/llm-eval/kappa.ts` (computes `precisionWilsonLb`,
  `recallWilsonLb` from `tp/fp/fn`).
- **Catalogue**: `packages/core/src/reliability/catalogue/sub-axes.ts` —
  `SubAxisRecord[]`, values **hardcoded** (`precisionMeasured`,
  `recallMeasured`, `precisionWilsonLowerBound`, `recallWilsonLowerBound`,
  `lastCalibrated`). No in-repo script writes them today.
- **SLO docs generator**: `scripts/render-coverage.ts` reads `SUB_AXES`, emits
  `docs/architecture/per-rule-slo.md` + `sub-axes.md`; N column always `—`.
- **FP-suppression helpers**: `packages/core/src/rules/_skip-context.ts`
  (438 lines) — `isInsideCodeDisplay`, `isCssCustomPropertyDeclaration`,
  `isColorTokenDefFile`, `isInVarFallback`, etc.

**The gap A fills:** the engine already produces per-rule confusion matrices
in-repo, but (a) it reports only J, not precision/recall/N; (b) its fixtures are
thin and non-adversarial, so its numbers flatter the rules (color reads J≈0.975
in-repo vs 44 % in the wild); (c) the catalogue's published numbers are pasted
by hand, disconnected from any in-repo computation.

## Core architecture

Turn the existing engine's confusion matrices into the **single source of truth**
for the catalogue's precision/recall/N, and make the fixtures adversarial enough
that the in-repo number tracks reality.

```
adversarial fixtures (positives = mutations, negatives = clean + REAL false-friends)
        │  (validation/adapters/*.ts, enriched)
        ▼
autonomous engine  ──►  per-rule confusion matrix {tp, fp, tn, fn}
        │  (validation/run-adapter.ts, score.ts)
        ▼
measurement derivation  ──►  {precisionMeasured, recallMeasured,
        │                      precisionWilsonLowerBound, recallWilsonLowerBound,
        │                      nSamples}   (reuse kappa.ts + wilsonLowerBound)
        ▼
catalogue verification test  ──►  fails if sub-axes.ts diverges from derived values
        │
        ▼
render-coverage.ts  ──►  per-rule-slo.md WITH a real N column
```

### Design units

1. **`nSamples` on the catalogue** — schema + every entry + SLO table.
2. **Fixture corpus per measured rule** — adversarial positives/negatives/
   false-friends, harvested from real OSS code (the vendored repos + calibration
   corpus), not invented.
3. **Measurement derivation** — a deterministic module that turns a confusion
   matrix into `{precision, recall, wilson LBs, nSamples}` (thin wrapper over
   existing `kappa.ts` + `wilsonLowerBound`).
4. **Catalogue-coherence test** — recomputes from fixtures via the engine and
   asserts `sub-axes.ts` matches; turns any drift into a CI failure (makes the
   published numbers falsifiable and reproducible).
5. **Promotion gate** — add the precision condition to `shouldPromote`.
6. **Detector work** — `color` (AST enrichment + adversarial fixtures), `shadow`
   (first real measurement + hardening), `contracts-strictness` (measure +
   decide).

## Scope — deliverables

Ordered **infrastructure first, consumers second**.

### Infrastructure

- **A-1 `nSamples` end-to-end.** Add `nSamples: number` to `SubAxisRecord`
  (`src/reliability/types.ts` + `sub-axes.ts`), populate every entry, and add an
  `N` column to `scripts/render-coverage.ts` output. No SLO line may show `—`
  for N. For genuine deterministic presence checks (`deterministicValidator:
  true`, precision 1.0 by construction) `N` reflects the fixture count exercising
  the validator; their 1.0 is structural and explicitly documented as such, not
  a measured detector score.
- **A-2 Measurement derivation module.** New module (e.g.
  `src/reliability/catalogue/measure.ts`) exposing
  `deriveMeasurement(matrix: ConfusionMatrix): { precisionMeasured,
  recallMeasured, precisionWilsonLowerBound, recallWilsonLowerBound, nSamples }`.
  Reuses `kappa.ts` confusion math and `wilsonLowerBound`. Pure, deterministic.
- **A-3 Catalogue-coherence test.** A vitest that runs the autonomous engine's
  per-rule matrices through `deriveMeasurement` and asserts the values stored in
  `sub-axes.ts` equal the freshly derived ones (float comparison within a fixed
  epsilon of 1e-9). Kills hand-pasted constants:
  from now on the catalogue's numbers must equal what the fixtures produce.
  Repeated identical Wilson LBs disappear for detectors because each rule's N and
  matrix are its own.
- **A-4 Promotion precision gate.** Extend `shouldPromote` in `promotion.ts`:
  promote only if `precisionMeasured >= 0.90` **and** `nSamples >= 30` **and**
  `recall Wilson LB >= threshold` (recall gate already present). Add the missing
  precision condition.

### Consumers (use the infrastructure)

- **A-5 `tokens/no-hardcoded-color` → measured, target ≥ 0.90 precision.**
  - Harvest the rule's **current false positives on real code** (vendored OSS
    repos) as adversarial `false-friend` fixtures: color literals in token
    definitions, doc/example blocks, multi-line `<code>`/`<pre>`, swatch/picker
    render components, `var()` fallbacks, schema/default values.
  - Enrich AST context in `_skip-context.ts` to suppress those classes (the rule
    file already notes "V1 needs AST context"). Keep recall at 100 %.
  - Re-measure via the engine; publish the honest number + N. Stays
    `experimental` / off-score; flagged promotion-ready iff it clears the gate.
- **A-6 `tokens/no-hardcoded-shadow` → first real measurement + harden.**
  - Build its adversarial fixture set (positives: hardcoded `box-shadow`;
    negatives + false-friends from real code). Distinct from
    `components/no-native-shadows`.
  - Measure (currently `precision: null`); harden `_skip-context` as needed.
    Stays `experimental`; promotion-ready iff it clears the gate.
- **A-7 `components/contracts-strictness` → measure + decide.**
  - Build fixtures, measure. If it clears the gate, flag promotion-ready; if it
    is inherently subjective / FP-prone, document that and keep it
    `experimental`. Either outcome is acceptable.

## Non-goals (explicit)

- **No score change.** Nothing flips `contributesToScore` in A. `color`,
  `shadow`, `contracts-strictness` that clear the gate are marked
  *promotion-ready*; the actual `v2 → v3` bump (with `LOCKED`-table entry) is
  sub-project D, bundling ai-governance pruning + all promotions.
- **No real-world validation.** Synthetic-but-honest in-repo fixtures only. The
  Bench (70-repo real-world firing-rate / precision sampling, `lyse-internal`) is
  a separate later sub-project, not gated on budget — simply not part of A.
- **No new rules.** `prefer-existing-component`, `no-style-escape-hatch`,
  `no-arbitrary-tailwind`, `standardized-variant-props`, `contrast-tokens`,
  `interactive-role-name`, `props-documented`, `usage-examples`,
  `component-manifest-completeness` belong to B and C.
- **No Figma.** Deferred by explicit user decision.

## Global constraints

- Strict TypeScript: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`,
  `verbatimModuleSyntax`.
- Determinism byte-for-byte; the autonomous engine and its CI gate stay green
  (`J=1`, zero metamorphic inconsistencies) for every touched rule.
- TDD: each fixture class and each `_skip-context` enrichment lands test-first.
- `opportunities` semantics unchanged; the scorer (`src/scorer.ts`) is not
  touched in A (no mutation-score impact).
- All artifacts (this spec, rule docs) in English.
- Rule metadata edited in the rule file via `createLyseRule`, never in
  `manifest.ts`; SLO/sub-axes docs regenerated via `render-coverage.ts`, never
  hand-edited.
- Conventional Commits; CHANGELOG `[Unreleased]` + changeset for user-facing
  changes; feature branch off `main`.

## Error handling & edge cases

- **A rule with no fixtures yet** → derivation yields `nSamples: 0`, precision
  `null`; the coherence test treats `null` measured values as "unmeasured, not
  asserted" so unmeasured rules don't break CI.
- **Detector cannot reach 0.90** (e.g. color lands at 0.82) → that is the
  published number; the rule stays experimental. The Definition of Done is
  *honest measured number + N shown*, not *must hit 0.90*. We never tune fixtures
  to flatter the rule (anti-pattern: teaching to the test) — false-friends are
  harvested from real code precisely to prevent this.
- **Presence checks** (precision 1.0 by construction) → N is the validator's
  fixture count; documented as structural, excluded from the "real detector"
  narrative.

## Testing strategy

- Per-rule fixtures double as the measurement corpus and the regression suite.
- A-3 coherence test is the keystone: it makes the catalogue numbers
  reproducible and prevents future hand-edits from drifting.
- The existing ~2900 tests and the `validate:autonomous` CI gate must stay green.
- New: unit tests for `deriveMeasurement` (matrix → metrics), the promotion gate
  (precision condition), and the `nSamples` rendering.

## Risks

- **Synthetic ≠ real-world.** Mitigated by harvesting false-friends from real
  OSS code (not imagination) and by sequencing the Bench as the real-world gate
  later. The honest framing: A measures precision *under a representative
  adversarial corpus*; it is a necessary first gate, not the final proof.
- **Color may not reach 0.90 on the first pass.** Accepted: honesty over forcing
  the number; it stays experimental with its true value displayed.
- **Adversarial-fixture authoring is slow and meticulous** — the bulk of A's
  effort. This is deliberate: it is where the credibility is earned.

## Definition of Done

- Every stable sub-axis shows a real `N` in `per-rule-slo.md`; no `—`.
- The catalogue's measured values are derived-and-verified from in-repo fixtures;
  no two unrelated detectors share an identical Wilson LB by coincidence.
- `shouldPromote` enforces precision ≥ 0.90 ∧ N ≥ 30 ∧ recall gate.
- `color` and `shadow` have honest measured precision + N; promotion-ready iff
  they clear the gate; both still off-score.
- `contracts-strictness` measured; promote-ready or documented-experimental.
- `validate:autonomous` CI gate green; ~2900 + new tests green; score output
  unchanged (`scoringVersion` untouched).
