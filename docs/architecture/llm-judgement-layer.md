# LLM judgement layer (Phase D design)

> Status: **design** (not yet built). Blueprint for scoring the *semantic* DS
> dimensions — the ones a deterministic rule cannot judge. Grounded in published
> multi-agent / LLM-as-judge research (sources at the end).

## Why this layer exists

Lyse's static engine is the deterministic, free, byte-stable floor. It handles
everything checkable from code/files (presence, schema, structural patterns).
But a residual of high-value dimensions need **judgement**, not pattern-matching:

- "Is this hardcoded value real drift, or a legitimate exception (chart palette,
  embed theme, icon fill)?" — the precision ceiling on `tokens/no-hardcoded-*`.
- "Is this AGENTS.md / disclaimer / explainability affordance actually adequate?"
  — the semantic AI-governance rules (`disclaimer-present`,
  `explainability-affordance`, `human-control-affordances`,
  `ai-marker-anti-patterns`, `value-gate-doc-present`).

These cannot reach a defensible ≥0.90 statically (proven: snippet calibration of
color/spacing). The LLM judgement layer is how they earn a *scored* contribution
— **only when confident**.

## Principles (non-negotiable)

1. **Deterministic first.** Static rules + the token registry pre-filter every
   candidate. The LLM only judges the residual the static engine cannot resolve.
2. **The LLM only ever narrows.** It drops/abstains; it never invents findings
   the static engine didn't surface. Static-only output stays a superset → the
   free floor is preserved byte-for-byte.
3. **Score only what's confident.** Three-way verdict, not binary. Abstention is
   a first-class outcome.
4. **Claude-only** (§0ter): specialists are distinct *system prompts*, not
   distinct model families. (Honest caveat: this weakens cross-family judge
   diversity — see PoLL — partially substituted by diverse prompts/lenses.)

## Architecture

```
                         ┌─ deterministic pre-filter (token registry, path/scope guards)
candidate findings  ──▶  │
(static, high-recall)    └─ Router (by input context: CSS · CSS-in-JS · Tailwind)
                                   │
                                   ▼
                   per-axis specialist judges  (Claude, distinct rubric + FP taxonomy)
                   color · spacing · governance-marker · disclaimer · …
                                   │  verdict + confidence + evidence quote
                                   ▼
                   borderline (conf 0.4–0.7)?  ──▶  swap-consistency micro-ensemble
                                   │                 (3 calls, permuted order, ⅔ agree)
                                   ▼
                   hallucination validator  (separate pass — cite real file:line)
                                   │
                                   ▼
                   conformal 3-way scoring split:
                     • confident-violation  → counted in score
                     • confident-FP         → dropped
                     • uncertain            → reported-only (not scored)
```

### Components

- **Deterministic pre-filter.** Token-registry lookup + the existing
  `_skip-context` guards. Cheap, removes the easy cases before any LLM call.
- **Router.** Assigns each file/finding to a context-specialist by input type
  (plain CSS vs CSS-in-JS vs Tailwind have different FP surfaces). Per Anthropic
  *routing*: a prompt tuned for one input degrades on others.
- **Specialist judges.** One per *analysis dimension* (not per rule — MultiVer:
  dimension-level specialization gained +17pp recall; per-rule is over-specialized
  and fragile). Each gets: file context + the relevant token subset + a
  criterion-separated rubric + the exact FP taxonomy for its axis. Output is
  bounded JSON: `{ verdict, confidence, evidenceQuote, reason }`.
- **Swap-consistency micro-ensemble.** Only for borderline confidence (0.4–0.7):
  re-judge 2× with permuted presentation order, require majority. Directly kills
  the position-bias failure mode (the most-documented LLM-judge bias). Cost is
  3× on borderline cases only.
- **Hallucination validator.** Separate pass (already exists: Layer-4 validator)
  that drops any verdict whose cited file:line/snippet doesn't exist. Anthropic's
  CitationAgent pattern; addresses MAST's FC3 (task-verification) failure class.
- **Conformal 3-way scoring.** Calibrate a confidence threshold on a labelled set
  so the *scored* subset's precision is ≥0.90 *by construction* (selective
  prediction). Uncertain findings stay reported-only — recall for the human is
  preserved, the score stays honest. This is how "0.90" is reached on a genuinely
  hard task: by abstaining, not by being perfect.

## What stays OUT

- Deterministic dimensions (presence/schema/structural) — the static engine owns
  them; routing them through an LLM is waste regardless of budget.
- Visual (colour contrast, rendered states) and deep-NLP (voice/tone) — declared
  out-of-scope in the coverage map; no LLM changes that.

## Honest risks (do not paper over)

- **Circularity.** Calibrating against Claude-made labels is Claude-judging-Claude.
  The ultimate anchor is project-level external validity (Spearman vs Kavcic,
  Track 8.6) + any human-validated subset — not this layer alone.
- **Recall/precision trade.** Aggressive FP-filtering suppresses true positives
  (SAST-triage finding). The rubric must weight false negatives as costly; the
  conformal split mitigates by abstaining rather than force-dropping.
- **Multi-agent fragility.** Naive multi-agent underperforms a strong single agent
  when context fragments (MAST: 44% of failures are system-design/prompt-spec).
  Mitigations: isolated self-contained specialist tasks, a single orchestrator
  owning global state, a strong synthesis + verification pass. Don't over-fan-out
  (Anthropic saw 50 agents spawned for trivial questions); ~one specialist per
  axis/context is the right granularity.
- **Claude-only diversity.** Cross-family judge panels (PoLL) cancel self-bias
  better than intra-Claude panels; we accept reduced diversity per §0ter.

## Sequencing

This layer is **Phase D** — built *after* the deterministic value is banked
(Phases A–C). Sub-axes whose semantic judgement clears conformal ≥0.90 then flip
`contributesToScoreWhenFiltered` (mechanism already shipped, inert).

## Sources

Anthropic *Building Effective Agents* (routing, orchestrator-workers,
evaluator-optimizer); Anthropic multi-agent research system; Berkeley/IBM *MAST*
(arXiv 2503.13657); Cognition *Don't Build Multi-Agents*; Cohere *PoLL — Replacing
Judges with Juries* (arXiv 2404.18796); *Mixture-of-Agents* (ICLR 2025); LLM SAST
FP-triage + MultiVer (per-dimension specialist gains); inference-scaling
self-consistency (N=4–16 sweet spot).
