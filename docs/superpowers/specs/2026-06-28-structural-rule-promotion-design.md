# Structural-rule promotion (Solution 1) — Design

> The positive counterpart to the detector-promotion finding. Detection rules
> can't reach 90% deterministically (proven twice). But genuinely-DETERMINISTIC
> STRUCTURAL rules have no semantic FP space — the check IS the ground truth —
> so they CAN be promoted via a comprehensive adversarial validator, confirmed
> by a deterministic corpus re-check. This finds the first promotable rules.

## Why structural rules are different (and CAN promote)

A detection rule (color, arbitrary-tailwind, interactive-role-name) judges
whether a value/pattern is "drift" — a semantic call whose false-positive space
is open-ended; real code always surfaces FP classes fixtures miss (proven: 22%
and 6% real precision despite synthetic J=1).

A structural rule (does a story declare `argTypes`/`args`? does a manifest entry
list `props`/`examples`? is a gradient token-referenced?) answers a
DECIDABLE question. Its only failure mode is a LOGIC bug, not semantic
ambiguity. So a comprehensive adversarial validator at J=1 is a genuine
correctness proof (the color-lesson artifact does not apply), and a
deterministic corpus re-check is the insurance the detectors taught us to keep.

## Scope (the experimental deterministic-structural rules)

- `stories/props-documented` — proof rule (Phase A first).
- `stories/usage-examples`
- `ai-surface/component-manifest-completeness` (has a validator, but N=3 — too thin for a tight Wilson LB).
- `tokens/no-hardcoded-gradient` (has a validator; expand/confirm).

EXCLUDED: detection rules (color/arbitrary-tailwind/escape-hatch/variant-props/
contrast-tokens/interactive-role-name — semantic, can't promote this way; the
LLM-filter is their path = Solution 2). `tokens/no-hardcoded-shadow` is
semantic-leaning (composite values) — excluded for now.

## Mechanism (per rule)

1. **Harden the adversarial validator** in the rule's oracle adapter: ≥ 35
   distinct POSITIVE cases (so a J=1 run yields precision AND recall Wilson
   LB ≥ 0.90 — Wilson LB at N=35, 0 errors ≈ 0.90) + a `falseFriends` array
   enumerating every STRUCTURE VARIANT that must NOT flag (for props-documented:
   a story with `argTypes`, a story with a named export carrying `args`, a
   component with no story [not counted], dsSelfMode, storyIndex null). The
   positive N comes from FIXTURES, not the corpus (structural rules under-fire
   mature repos — that is a recall-coverage fact about real repos, irrelevant to
   the validator which we control).
2. **Sync the catalogue** (coherence-enforced): the entry moves null → measured
   (`deriveMeasurement` numbers), but STAYS `status: "experimental"`,
   `contributesToScore: false` (Phase A = measured, NOT scored).
3. **Deterministic corpus confirmation (insurance)**: add a per-rule verifier to
   `src/reliability/measure/auto-label.ts` that INDEPENDENTLY re-derives the
   rule's verdict on a real finding (re-parse the story, re-check argTypes/args —
   NOT the LLM judge, NOT trusting the rule fired). Run the rule over the bench
   corpus, auto-label a sample, and CONFIRM corpus precision ≥ 0.90 with no
   structure variant the validator's `falseFriends` lacked. A surprise FP class →
   the rule was not as deterministic as believed (like interactive-role-name's
   htmlFor surprise) → it drops to "not promotion-ready", recorded honestly.
4. **Verdict**: `promotion-ready` iff syntheticPrecLB ≥ 0.90 AND
   syntheticRecallLB ≥ 0.90 AND corpusPrecLB ≥ 0.90 AND no un-enumerated FP class.

## Two phases

- **Phase A (now, NO score change):** harden + measure (off-score) + corpus-
  confirm + readiness verdict for the ~4 rules. Output: which are
  promotion-ready. The catalogue carries measured numbers but every rule stays
  `contributesToScore: false`.
- **Phase B (post-#223-merge, deliberate):** flip the promotion-ready rules to
  `status: "stable"`, `contributesToScore: true` — the single v2→v3 semver-major
  score bump, coordinated with D (the ai-governance prune). Updates
  `scoring-contract.test.ts`'s locked table once. NOT in this spec's execution.

## Honesty guardrails

- Phase A changes NO score. `scoring-contract.test.ts` + `scoringVersion`
  unchanged throughout Phase A.
- The catalogue-coherence keystone test enforces every number = `deriveMeasurement`
  (no hand-pasted constants).
- The deterministic verifier must re-derive ground truth INDEPENDENTLY (re-parse
  the artifact), never return tp just because the rule fired (the auto-label.ts
  contract from the measurement campaign — `needs-verifier` → fp, never silent tp).
- A rule that fails any gate is recorded `not-promotion-ready` with the reason —
  not forced.

## Testing

- Per rule: the autonomous engine + catalogue-coherence test (numbers real); the
  new auto-label verifier unit-tested (a genuinely-undocumented story → tp; a
  documented one → fp; a non-structural ruleId → throws); full suite green;
  `scoring-contract` UNCHANGED.
- The readiness report (reuse `scripts/measure-rules.ts` + the promotion-readiness
  fields) gains the structural rules' verdicts.

## Files

- Each target rule's oracle adapter (`validation/adapters/*` / `validation/*-adapters.ts`) — ≥35 positives + comprehensive `falseFriends`.
- `src/reliability/catalogue/sub-axes.ts` — entries null → measured (off-score), coherence-synced.
- `src/reliability/measure/auto-label.ts` — a verifier per target rule (+ its test).
- `rules-manifest.json` — regenerated.
- `docs/superpowers/promotion-readiness-report.{md,json}` — structural verdicts.

## Global constraints

- Strict TS; ESM `.js`. Determinism (fixtures + the deterministic verifier; no LLM in this path). No score change in Phase A. English. Conventional Commits; branch `feat/color-to-90`. The catalogue-coherence keystone test is the guard.

## Non-goals

- Phase B (the score flip) — post-merge, the v2→v3 bump, with D.
- Detection rules — Solution 2 (the LLM precision filter), separate.
- `prefer-existing-component`, Figma, the advisor layer — separate efforts.
