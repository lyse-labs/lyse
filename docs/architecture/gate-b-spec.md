# Gate B — Real-corpus firing-rate regression gate

## Problem: synthetic proofs are necessary but not sufficient

The autonomous validation engine (`validation/run.ts`, `validate:autonomous`) proves
Youden's J=1 on synthetic mutation fixtures. The construction oracle guarantees recall
and no false positives **on the construction set itself** — by design, each fixture is
labelled at creation time. That is Gate A: proven, deterministic, zero-LLM.

Synthetic ≠ representative. Real OSS design systems have messy token names, mixed
paradigms, partial DTCG adoption, vendor prefixes, and edge cases that fixtures may not
anticipate. Gate A cannot detect false positives that only appear on real code.

## Gate B definition

Gate B is a **real-corpus firing-regression gate** over the
[`lyse-labs/lyse-bench`](https://github.com/lyse-labs/lyse-bench) corpus
(70 curated OSS design systems, CC BY 4.0).

For each rule, Gate B tracks the **daily firing count** across the corpus and keeps a
rolling 28-day history (the `rule-firings:<ruleId>` substrate in lyse-internal). It
computes a **modified (MAD-based) z-score** of today's count against that history and
fails any rule whose `|z|` exceeds a threshold (3.5, consistent with the existing
firing-anomaly detector):

- **Spike** (`today > baseline`) — likely new false positives introduced.
- **Drop** (`today < baseline`) — likely lost recall on real-world patterns.

> **Why count + z-score, not rate + fixed baseline.** An earlier draft of this spec
> defined Gate B as `firing_rate = files_flagged / files_scanned` against a stored ±0.05
> baseline. That was reconsidered during implementation: `files_scanned` is not captured
> per rule, and a fixed absolute-rate baseline is brittle as the corpus grows/shrinks
> during discovery. A robust z-score over the rolling history needs no manual baseline,
> tolerates corpus-size drift, and reuses the same `modifiedZScore` already powering the
> snapshot's firing-anomaly detection.

Gate B is a **regression/sanity gate**, not a labelled-precision oracle. The corpus has
no per-repo gold labels beyond the calibration subset described in
`docs/architecture/calibration.md`. It detects drift, not absolute correctness.

## Why Gate B lives in `lyse-labs/lyse-internal`

1. **Network access.** Corpus repos are cloned at runtime; the public CLI is local-first
   and must not pull 70 repos as a side effect of `lyse audit`.
2. **Private baseline storage.** The firing-rate baseline JSON and any calibration labels
   are internal engineering artefacts, not public API.
3. **Runner coupling.** The Gate B runner orchestrates corpus cloning, parallel `lyse audit`
   invocations, and delta comparison — infrastructure appropriate to the internal CI
   environment, not the open-core package.
4. **No source-level coupling.** The public CLI exposes no interface that Gate B imports.
   lyse-internal calls `lyse audit` as a subprocess over HTTPS/localhost, the same way
   any user would.

The public repository provides the engine and adapters (Gate A harness). lyse-internal
provides the corpus, the runner, and the baseline.

## Truth-grade of the dual gate

| Gate | Fixture type | Guarantee | Mechanism |
|------|-------------|-----------|-----------|
| A — synthetic | Construction-set mutations | J=1 proven (recall + no FP on set) | `validation/run.ts` (`validate:autonomous`) |
| A — render | Real Chromium DOM/CSS | J=1 proven for execution-oracle rules | `validation/render-lane.ts` (`validate:render`) |
| B — real corpus | 70 real OSS design systems | Firing-count stable vs z-score baseline | lyse-internal verdict (implemented) |
| Coverage | All adapters registered | Every scored rule has an adapter | `validation/coverage.ts` |

The render lane is the execution-oracle half of Gate A: `tokens/rendered-token-fidelity`
and `a11y/runtime-axe` cannot be validated statically (no browser), so they run through
real Chromium. The static `engine` CI job has no browser; the `engine-render` job sets
`LYSE_RENDER_REQUIRED=1` so a missing Chromium hard-fails CI rather than skipping silently.

Neither gate claims 100% real-world precision. Rules that are judgment-scope (e.g.
`drift/*`) remain report-only and are excluded from Gate A scoring. Gate B complements
Gate A by providing empirical grounding on real code.

### What Gate A cannot see — the `info` blind spot

`validation/audit-probe.ts#ruleFlagged` counts only `error` and `warning` findings
as a flag. Since the four-class resolver migration, the `novel` class on the seven
**numeric** token axes (spacing, radii, border-width, opacity, z-index, breakpoints,
motion durations) emits `info` — a deliberate degradation: a value unlike any token
is reported, but Lyse does not claim it is drift.

A mutation that lands `novel` is therefore invisible to the oracle, and reads as a
false negative even when the rule behaved correctly. Two consequences:

- Every construction adapter for those axes gives its fixture a **real token scale**,
  so the mutation lands `near` (warning) rather than `novel`. Without that, `J` drops
  to 0 for reasons that have nothing to do with the rule.
- **A `J=1` on one of those rules proves near-scale drift detection with no false
  positives on the set. It does not prove the far-from-scale (`novel`) branch.** That
  branch is covered by unit tests in `packages/core/tests/rules/` instead, and is
  outside the gate's guarantee.

Closing it means teaching `evaluateAdapter` an expected severity (or giving the probe
an opt-in for `info`), not widening the predicate — widening it unconditionally would
make every advisory finding across all 66 rules count as a violation. Not yet done.

## Status

Gate B is **implemented** in `lyse-labs/lyse-internal`: a pure `gateBVerdict()` + a
`runGateB(env)` reader + a `GET /v1/bench/gate-b` route, running over the live corpus via
the bench cron. See `internal/bench/GATE-B.md` there for the firing-regression (z-score)
mechanism and the rationale for diverging from the rate/baseline draft above.

References:
- Synthetic gate: `packages/core/validation/run.ts`, script `validate:autonomous`
- Render (execution-oracle) gate: `packages/core/validation/render-lane.ts`, script `validate:render`
- Completeness gate: `packages/core/validation/coverage.ts`
- Calibration methodology: `docs/architecture/calibration.md`
- Corpus: `lyse-labs/lyse-bench` (public, CC BY 4.0)
