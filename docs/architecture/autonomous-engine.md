# The Autonomous Validation & Expansion Engine — final architecture

> **Status:** v1.0 spec. The final design for Lyse's zero-human-in-the-loop engine that discovers,
> synthesizes, and validates design-system + AI quality checks. Companion to
> [`coverage-universe.md`](./coverage-universe.md) (the denominator) and the implementation plan
> `docs/superpowers/plans/2026-06-22-autonomous-validation-engine.md` (step 0).
>
> Built from 8 adversarially-verified research sweeps. Every load-bearing claim is sourced.

## The one idea

**Lyse is a truth router, not a linter.** Every candidate check is routed to the strongest source
of truth that exists for it, and every emitted finding carries the **grade of truth** it earned
(PROVEN / MEASURED / ADVISED / DEFERRED). Specialized agents continuously *expand* what can be
proven and *calibrate* what can only be advised — but the router never lets an opinion pass as a proof.

## The hard constraint that shapes everything

**Autonomous reliability cannot come from an agent's self-verification.** Intrinsic self-correction
(no external oracle) measurably *degrades* performance — LLMs cannot judge the correctness of their
own reasoning and flip correct answers to incorrect more often than the reverse (GPT-4 GSM8K
95.5→89.0; ICLR 2024, Huang et al., peer-reviewed, multiply corroborated). Therefore reliability
**must** be grounded on an **external execution oracle**.

Transposed to Lyse (TDFlow / SWE-Bench, EACL 2026): an agent solving *with* a provided test oracle
reaches 94.3%; generating *its own* test it drops to 68.0%. The stated bottleneck is verbatim "the
accurate generation of valid reproduction tests." **For Lyse the bottleneck is identical: not
writing the detector, but building the validation oracle.** That oracle is the dual gate below — and
Lyse's position is *stronger* than SWE-Bench because its labels come from construction (we inject the
defect → the label is perfect), whereas human test suites are incomplete (UTBoost, ACL 2025: up to
28.4% of SWE-Bench "passes" were false positives from incomplete oracles).

## Architecture — a continuous, supervised, oracle-gated loop

```
            ┌──────────────── ORCHESTRATOR (lightweight supervisor) ────────────────┐
            │  routes work, caps spend, contains cascades, decides escalate/abstain  │
            └───────────────────────────────────────────────────────────────────────┘
   ┌─────────────┐   ┌──────────────┐   ┌───────────────┐   ┌───────────────────────┐
   │ SCOUT agents │→ │ ORACLE ROUTER │→ │ SYNTHESIZER   │→ │ DUAL GATE  +  ADVERSARIAL│
   │ (per domain) │   │ (truth-grade) │   │ (writes check │   │  VERIFY  → ADMIT / REJECT│
   └─────────────┘   └──────────────┘   │ + mutators)   │   └───────────────────────┘
        mine             route             generate              prove externally
   expert practice    to strongest         the detector       (no self-judgement)
   + lyse-bench         oracle                                         │
                                                                       ▼
                                              TRUTH-GRADED OUTPUT: PROVEN / MEASURED / ADVISED / DEFERRED
```

### 1. Scout agents (specialized, per domain)
One per axis (tokens, a11y, components, AI-governance, data-viz, i18n, motion, native…). They mine
the codified authorities in `coverage-universe.md`, real code in lyse-bench, and DS changelogs/issues,
and **propose** candidate checks. *Specialized beats generic: domain-adapted heuristics find 2× more
issues than generic Nielsen (Langevin, CHI 2021, p<0.05).*

### 2. Oracle router
Each candidate descends the ladder; first hit wins and sets the truth-grade:
construction → execution → cross-tool → metamorphic → **decompose** (scout) → outcome → frozen-human
→ grounded-advisory → **defer to human**.

### 3. Synthesizer
For candidates landing on a construction/execution oracle, it auto-writes the detector + its mutation
operators + metamorphic relations (KNighter pattern: synthesize the checker from the pattern,
validated against the originating defect).

### 4. Dual gate — the external oracle (the reliability core)
A detector is admitted **only if it passes BOTH**:
- **Gate A (mutation/construction):** catches injected defects, Youden's J ≥ τ. *Labels are perfect by
  construction — this is a stronger oracle than human test suites.*
- **Gate B (bench):** does NOT inflate false positives across the 70 real design systems of lyse-bench.
  *This is the representativeness leg the mutation gate structurally lacks (NIST trilemma).*

Gate B's strength is bounded by corpus coverage (UTBoost caveat): insufficient coverage → false
positives labeled valid. So **corpus coverage is the thing to invest in**, not agent cleverness.

### 5. Adversarial verifiers
Before admission, N independent **cross-family** skeptics try to *refute* the detector (find a
counterexample / FP class). Majority-refute → reject. *Do not use unweighted LLM-jury as the gate:
weak verifiers are noisy/biased; naive aggregation lets low-quality verifiers degrade accuracy
(Weaver, Stanford 2025) — the gate is execution against the labeled corpus, the panel only screens.*

### 6. Orchestrator (supervisor)
Lightweight meta-agent: routes, caps token spend, and contains **cascading failure** — the primary
multi-agent failure mode, where one hallucination in shared memory poisons all downstream agents
(Anthropic; MAST, 1600+ traces). Decides **escalate/abstain vs act**.

### 7. Tooled interface (ACI)
Invest in the agent-computer interface (corpus access, detector execution, gate-result reading) as
much as the model: a dedicated ACI roughly *doubled* SWE-agent success at constant model (12%→3%
without it, SWE-agent NeurIPS 2024).

## What "success rate close to 100%" means here — precisely

Two distinct numbers; only the honest framing is defensible:

1. **~100% PRECISION of what it asserts.** The dual gate + adversarial verify never admit an
   over-claim. What Lyse marks PROVEN/MEASURED is ~always right. *This* is the achievable ~100%.
2. **Coverage of the addressable universe → 100% asymptotically.** The loop is a **monotone ratchet**:
   scouts propose endlessly, gates admit only the proven, coverage only ever climbs.
3. **The judgment residue is DEFERRED**, surfaced as advice/questions — not counted as failure.

"100% of *all* scopes automatically" is impossible and would be the over-claim that destroys
credibility. "~100% trustworthiness + asymptotically-complete addressable coverage + honest
deferral" is the real, expert target.

## The honest ceilings (sourced)

- **Self-verification floor:** no introspective loop reaches reliability; only external oracles do (ICLR 2024).
- **Oracle-coverage ceiling:** reliability is capped by gate/corpus coverage, not agent skill; benchmarks
  overstate by 15-28% when oracles are incomplete (UTBoost).
- **Cost:** multi-agent ≈ 15× tokens; token spend explains ~80% of success variance — run it only where
  value justifies compute; a supervisor cuts ~30% with equal accuracy.
- **Judgment wall:** pure taste/brand/editorial has no oracle and no fact of the matter → DEFERRED forever.
- **Domain transfer:** all agentic evidence is from code-repair; mapping oracle-test ↔ validation-gate is
  a reasoned analogy, not a measured result for autonomous rule-synthesis in production. Validate empirically.

## The two failure modes the whole design defeats

| Failure | Antidote |
|---|---|
| **Under-reach** (leave provable things unproven) | scout agents + completeness gate (Task 12) |
| **Over-claim** (opinion masquerading as proof) | dual gate + adversarial verify + truth-grade labels |

## Build order

1. **Step 0 (now):** the deterministic mutation + oracle + completeness gate (the plan). This IS the
   external oracle every later stage depends on — nothing autonomous is reliable without it built first.
2. Wire **Gate B** (lyse-bench real-FP) as the second admission gate.
3. Add the **synthesizer + adversarial verify**, behind both gates.
4. Add **scout agents** per domain (the discovery ratchet).
5. Add the **grounded-advisory** channel (separate from the validated score) + escalation policy.

## Evidence base (verified, sourced)

| Claim | Source |
|---|---|
| Intrinsic self-correction degrades performance | ICLR 2024 (Huang et al.) arXiv 2310.01798 |
| Tests = truth oracle; 94.3% with / 68% without provided tests; "valid test generation = final frontier" | TDFlow, EACL 2026, arXiv 2510.23761 |
| Benchmarks overstate (28.4% false-positive passes from incomplete oracles) | UTBoost, ACL 2025 |
| Orchestrator-worker + specialization wins (+90.2%, vendor eval); 15× tokens; 80% variance = spend | Anthropic multi-agent system |
| Cascading failure is the primary multi-agent risk | Anthropic; MAST arXiv 2503.13657 |
| ACI drives reliability as much as the model (≈2×) | SWE-agent, NeurIPS 2024, arXiv 2405.15793 |
| Weak verifiers unreliable; need learned aggregation, not naive jury | Weaver, Stanford 2025 |
| Specialized domain heuristics find 2× more than generic | Langevin, CHI 2021 |
| Grounding helps (+55%) but stays below human expert (0.48 vs 0.75) | UICrit, arXiv 2407.08850 |
