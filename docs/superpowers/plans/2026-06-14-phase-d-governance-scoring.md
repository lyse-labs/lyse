# Phase D — Conformal Governance Scoring Implementation Plan

> **For agentic workers:** execute task-by-task with TDD. Steps use checkbox syntax.

**Goal:** Let the AI-governance axis contribute to the trusted Health Score — but only
the LLM-graded findings the model is confident about — so the score finally
discriminates AI-readiness (the #72 probe proved it currently doesn't).

**Architecture:** Deterministic detection → LLM grader (now emits per-finding
confidence, D-gov-1) → **conformal scoring gate** (this plan): a governance sub-axis
counts toward the score only when (a) the grader ran and (b) the finding's confidence
clears a calibrated per-sub-axis threshold θ; sub-θ findings stay reported-only.
"N/A for no-AI repos" is emergent — governance rules don't fire without AI.

**Tech stack:** TS, vitest. Builds on `Finding.llmJudgement` (D1/D-gov-1),
`computeScoreV1`, `resolveStableSubAxes`, the `spearmanRho` util, and the #72 harness.

---

## Sequencing & feasibility

- **D-gov-2a — conformal gate mechanism (this increment).** Pure scoring logic +
  tests, shipped INERT (no sub-axis is conformal-gated yet). No LLM, no data. Certain.
- **D-gov-2b — governance gold + calibration (data-gated).** Needs an AI-having corpus
  (locally only carbon + cloudscape; others require cloning) and a governance gold
  (Claude-adjudicated proposals — circular, §0ter-accepted, Kavcic-anchored). Find θ per
  sub-axis where confident-subset precision LB ≥ 0.90. **Honest constraint:** the local
  AI-having corpus is tiny → θ will be statistically thin until the corpus grows. Report
  n and CI; do not over-claim.
- **D-gov-2c — flip + re-run #72.** Flip `contributesToScoreWhenGraded` for sub-axes that
  clear; re-run `external-validity/correlate.ts` to see if Spearman vs Kavcic wakes up.
- **D3/D4 (later).** Router (context specialists), swap-consistency micro-ensemble.

---

### Task 1 (D-gov-2a): conformal gate in `computeScoreV1`

**Files:**
- Modify: `packages/core/src/reliability/score/formula-v1.ts`
- Test: `packages/core/src/reliability/score/__tests__/formula-v1.test.ts`

- [ ] **Step 1: failing tests.** A finding in a conformal-gated sub-axis counts toward
  the score iff `llmJudgement.confidence >= threshold`; sub-threshold and
  no-judgement findings become reported-only; base-stable sub-axes are unaffected;
  default (no conformal map) is byte-identical to today (inert).

- [ ] **Step 2: implement.** `ScoreInput` gains optional
  `conformalSubAxes?: ReadonlyMap<string, number>` (subAxisId → θ). In the loop: a
  finding whose subAxisId is in `conformalSubAxes` counts only if
  `finding.llmJudgement?.confidence` is ≥ θ; otherwise reported-only. Base-stable path
  unchanged. Omitting the param ⇒ inert.

- [ ] **Step 3: run tests; full suite; build.**

- [ ] **Step 4: commit** `feat(scoring): conformal confidence gate in computeScoreV1 (Phase D, D-gov-2a)`.

(Resolver `resolveConformalSubAxes(subAxes, {graderRan})` + the `contributesToScoreWhenGraded`
/ `conformalConfidenceThreshold` SubAxisRecord fields + pipeline wiring land in D-gov-2b,
when there is a real θ to set — kept out of 2a to ship a tight, inert, certain core.)
