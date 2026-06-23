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

Gate B is a **real-corpus firing-rate regression gate** over the
[`lyse-labs/lyse-bench`](https://github.com/lyse-labs/lyse-bench) corpus
(70 curated OSS design systems, CC BY 4.0).

For each rule, Gate B measures:

```
firing_rate(rule, corpus) = files_flagged / files_scanned
```

A stored baseline holds the last known-good firing rate per rule. Gate B fails if any
rule's firing rate deviates beyond a configured threshold (e.g. ±0.05 absolute) relative
to that baseline:

- **Spike** — sudden increase → likely new false positives introduced.
- **Drop** — sudden decrease → likely lost recall on real-world patterns.

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
| B — real corpus | 70 real OSS design systems | Firing-rate stable vs baseline | lyse-internal runner (pending) |
| Coverage | All adapters registered | Every scored rule has an adapter | `validation/coverage.ts` |

The render lane is the execution-oracle half of Gate A: `tokens/rendered-token-fidelity`
and `a11y/runtime-axe` cannot be validated statically (no browser), so they run through
real Chromium. The static `engine` CI job has no browser; the `engine-render` job sets
`LYSE_RENDER_REQUIRED=1` so a missing Chromium hard-fails CI rather than skipping silently.

Neither gate claims 100% real-world precision. Rules that are judgment-scope (e.g.
`drift/*`) remain report-only and are excluded from Gate A scoring. Gate B complements
Gate A by providing empirical grounding on real code.

## Status

Gate B is **spec-ready**. Implementation is pending in `lyse-labs/lyse-internal`.

References:
- Synthetic gate: `packages/core/validation/run.ts`, script `validate:autonomous`
- Render (execution-oracle) gate: `packages/core/validation/render-lane.ts`, script `validate:render`
- Completeness gate: `packages/core/validation/coverage.ts`
- Calibration methodology: `docs/architecture/calibration.md`
- Corpus: `lyse-labs/lyse-bench` (public, CC BY 4.0)
