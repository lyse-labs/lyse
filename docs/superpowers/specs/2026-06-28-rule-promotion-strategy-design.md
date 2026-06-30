# Rule promotion strategy — Design

> How to get the socle's experimental rules to a DEFENSIBLE ≥90% precision/recall
> and promote them to scored — the capability Lyse needs (experimental-only rules
> don't build the product's value). Reconciles the color lesson (synthetic can't
> promote) with the fact that most socle rules CAN be promoted rigorously.

## The core insight

The color finding — "synthetic construction-oracle precision is a mutation-count
artifact and cannot gate promotion" — is **specific to rules whose
false-positive space is SEMANTIC and open-ended**. A hex literal might be real
drift, a brand color, or chart data; fixtures cannot enumerate that, so a
synthetic J=1 is hollow and only real code reveals the true FP rate.

But a rule whose FP space is **SYNTACTIC / AST-bounded** has no such gap: every
class of false positive is itself a code pattern that CAN be enumerated in
fixtures. For such a rule, a comprehensive adversarial validator (rich
`falseFriends` covering every real FP class) at J=1.0 is a genuine correctness
proof, not an artifact — there is no semantic ambiguity for real code to exploit.
This is exactly how the **53 already-scored rules** were promoted.

**Promotion path is therefore a function of FP-space shape, not rule novelty.**

## Rule classification (the 21 experimental rules)

**Bounded-FP — promotable via rigorous validator + real-corpus confirmation (~9):**
- `components/no-arbitrary-tailwind` — `p-[12px]` etc.; syntactic, closed.
- `components/no-style-escape-hatch` — inline `style` on a DS component; AST, closed.
- `components/standardized-variant-props` — ≥2 boolean style flags; AST, closed.
- `stories/props-documented`, `stories/usage-examples` — deterministic AST on parsed stories.
- `a11y/contrast-tokens` — deterministic WCAG math on literal pairs (var() skipped → recall-bounded, precision deterministic).
- `a11y/interactive-role-name` — wraps battle-tested `jsx-a11y/control-has-associated-label`.
- `components/contracts-strictness` — AST type-contract check (already recall 1, has adversarial corpus).
- `tokens/no-hardcoded-gradient`, `ai-surface/component-manifest-completeness` — already carry `deterministicValidator: true`; lowest-hanging.

**Semantic-open — real-corpus only, may cap <90% (2):**
- `tokens/no-hardcoded-color` — proven ~85–88% lexical ceiling (documented).
- `tokens/no-hardcoded-shadow` — semantic-ish (composite values); measure on corpus, assess.

**Out of scope (10):** the 7 ai-governance rules D retires; `a11y/runtime-axe` + `tokens/rendered-token-fidelity` (render-only, separate `--render` lane).

## Architecture: two phases

### Phase A — determine WHO promotes (NO score change, doable now)

1. **Batch the judge** (`judge.ts`): replace per-FILE LLM calls with per-CHUNK
   batches (the prompt already uses each finding's `snippet`, not the file, so
   batching across files is free). One call per ~20 findings → detection
   measurement becomes feasible (≈100 calls total vs thousands). Enables the
   real-corpus confirmation layer.
2. **Per bounded rule, harden the adversarial validator**: enumerate every real
   FP class as `falseFriends` in the rule's oracle adapter (the FP classes are
   syntactic → enumerable). Target J=1.0 across the comprehensive adversarial set.
3. **Real-corpus confirmation**: run the batched judge on the bench corpus for
   that rule; CONFIRM no surprise FP class exists in the wild (precision on real
   findings ≥ 0.90, and no FP class absent from the validator's `falseFriends`).
   The corpus run is the check that the synthetic enumeration was COMPLETE — the
   guard against a hidden semantic gap.
4. **Promotion-readiness report**: a rule is `promotion-ready` when BOTH hold:
   adversarial validator J=1.0 over a comprehensive FP enumeration AND real-corpus
   precision Wilson LB ≥ 0.90 (+ recall Wilson LB ≥ 0.90 from the seeded/synthetic
   positive set). Output the list; change NO catalogue numbers yet.

### Phase B — promote (deliberate score change, post-#223-merge)

Flip each `promotion-ready` rule: `status: "stable"`, `contributesToScore: true`,
real measured precision/recall + Wilson LBs + `nSamples` in the catalogue. This
is the deferred **v2→v3 score bump** — a semver-major event: update
`scoring-contract.test.ts`'s locked table, bump `scoringVersion`, ADR note. Done
ONCE for the whole cleared batch (not per rule). Coordinated with D (the
ai-governance prune) so the score changes exactly once.

## Honesty guardrails (non-negotiable)

- A bounded rule promotes ONLY if its `falseFriends` enumeration is COMPLETE,
  proven by the real-corpus confirmation finding no new FP class. If the corpus
  surfaces an FP class the fixtures lacked → the rule is NOT bounded as believed
  → it drops to the semantic bucket (real-corpus, may cap). This prevents
  declaring a rule "bounded" by assertion.
- `llm-provisional` corpus labels are CONFIRMATION signal, not the promotion
  basis; where the judge is uncertain, the human packet still gates (the judge
  validates completeness of the enumeration, it doesn't hand out the 90%).
- Color/shadow get no special pleading — measured honestly, promoted only if
  they actually clear, else they stay experimental with the documented ceiling.
- No score change in Phase A. Phase B is the single, deliberate semver-major bump.

## Testing

- Phase A step 1 (judge batching): unit test with injected fake connector —
  N rows → ceil(N/BATCH) connector calls, index mapping correct across chunks,
  per-chunk error → that chunk's rows uncertain. Existing judge tests stay green.
- Per-rule validator hardening: each rule's oracle adapter gains `falseFriends`;
  the autonomous engine + catalogue-coherence test enforce the numbers are real
  (the coherence keystone already forbids hand-pasted constants).
- Promotion-readiness report: pure report function unit-tested (rule with both
  gates green → promotion-ready; one gate failing → not).
- Phase B: `scoring-contract.test.ts` updated deliberately (the bump); all suites green.

## Files (Phase A)

- `packages/core/src/reliability/measure/judge.ts` — per-chunk batching.
- Each bounded rule's oracle adapter (in `validation/adapters/*` / `validation/*-adapters.ts`) — comprehensive `falseFriends`.
- `scripts/measure-rules.ts` — feed the batched judge; emit a `promotion-ready` column.
- `docs/superpowers/promotion-readiness-report.{md,json}` (committed; corpus gitignored).

## Global constraints

- Strict TS; ESM `.js`. Determinism in fixtures; the judge is non-deterministic
  (confirmation only, tagged). No score change in Phase A. English. Conventional
  Commits; on `feat/color-to-90` (Phase A) then a fresh branch post-merge (Phase B).
- The catalogue-coherence keystone test stays the guard: any catalogue number
  must equal engine-derived (no hand-pasted precision).

## Non-goals

- Phase B execution before #223 merges (the score bump is post-merge, with D).
- Promoting color/shadow by lowering the bar — they clear honestly or stay experimental.
- The render-only lane (`--render`) — separate effort.
- `prefer-existing-component` — separate socle item.
