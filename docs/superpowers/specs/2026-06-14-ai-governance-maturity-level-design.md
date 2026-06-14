# AI-Governance Maturity Level — design

> Status: **design**. Resolves the orientation problem the #72 probe exposed:
> the penalty-based Health Score cannot measure AI-governance maturity (it would
> rank an AI-mature DS *below* a no-AI DS). Governance must be measured
> **positively** as a maturity level.

## Problem

`Health Score = 100 − penalty×1.5`. Penalty rewards *absence*: a no-AI DS fires
zero governance findings → no penalty → high score; an AI-mature DS with minor
gaps fires findings → penalty → lower score. So in the penalty model Carbon
(Kavcic L2) would score *below* Bootstrap (Kavcic L0) — backwards. The #72 probe
showed the trusted score is flat across the AI-readiness corpus for exactly this
reason: governance is detected but cannot be folded into a penalty score sanely.

## Approaches considered

- **A — Blend a positive governance sub-score into the single Health Score.**
  Correct orientation, but forces a composite-indicator design (axis weights,
  compensability, Sobol sensitivity — the open questions the architecture audit
  flagged). Perturbs the existing score + smoke bands. Heavy; premature.
- **B — Report a separate `AI-Governance Maturity Level` (0–5), à la Kavcic
  (RECOMMENDED).** Keep the Health Score as the drift/completeness number.
  Add a second, independent output: a 0–5 governance maturity level computed
  from affordance presence. Clean, bounded, directly comparable to Kavcic, and
  N/A is natural — a no-AI DS is **L0** ("no visible AI layer"), which is
  *correct*, not a reward.
- **C — Invert governance rules to positive + force them through the penalty
  model with an N/A gate.** The penalty model structurally can't express
  maturity. Rejected.

## Decision: Approach B

A new deterministic output: **AI-Governance Maturity Level ∈ {0,1,2,3,4,5}**,
mapped from Lyse's governance signals to Kavcic's ladder. Reported alongside the
Health Score; **not** folded into it (that composite question waits until the
level is externally validated).

### Level mapping (deterministic, presence-based)

Kavcic's ladder → Lyse signals (a level requires the lower levels' signals):

| Level | Kavcic meaning | Lyse deterministic signal |
|---|---|---|
| **L0** | No visible AI layer | No AI-marker component, no reserved AI tokens, no AI-surface AI artifact |
| **L1** | AI as decoration | Reserved AI tokens present (color/role) but no marker component |
| **L2** | AI as a component | A dedicated AI-marker component is shipped (`ai-marker-component-present` inventory) |
| **L3** | AI as interaction pattern | L2 + AI interaction affordances: loading/error states, feedback control, or content live region present |
| **L4** | AI as governance layer | L3 + governance affordances: human-control + explainability + disclaimer present, no marker anti-patterns |
| **L5** | AI as system infrastructure | Not deterministically detectable (named agent/Copilot tier) — capped at L4 by the static engine; L5 needs the LLM/manual layer |

"Present" = the corresponding rule reports the affordance (inventory `info`) or
does not report a gap. The mapping reuses existing rules; no new detection.

### N/A is emergent and correct

A no-AI DS hits L0 by definition. It is not "rewarded" — L0 is the floor of the
AI-readiness ladder, exactly as Kavcic defines it. No special N/A gating needed.

### Why this unblocks #72

`external-validity/correlate.ts` can now correlate **Lyse's L0–L5 vs Kavcic's
L0–L5** directly — an interpretable, monotonic, apples-to-apples Spearman, on the
public anchor subset. The flat-Health-Score problem disappears because we compare
the right quantity.

### Two-tier roadmap

1. **Deterministic level (this design).** Presence-based L0–L4. Unblocked, free,
   byte-stable. Ships as a reported output; re-runs #72.
2. **LLM adequacy refinement (later, Phase D conformal).** The grader judges
   whether a present affordance is *adequate* (not just present) with confidence;
   the conformal gate (already built, D-gov-2a) can demote a level when adequacy
   is low-confidence. This is where the accepted §0ter circularity + Kavcic anchor
   live. Deferred until the deterministic level is externally validated.

## Components

- `reliability/governance-maturity.ts` — pure function
  `computeGovernanceMaturityLevel(signals) → 0..5` + the signal extraction from
  an audit result (which governance affordances fired/are present).
- `explain --score` output: add an `AI-Governance Maturity: Lk` line.
- `external-validity/correlate.ts`: correlate the level vs Kavcic (re-use Spearman).

## Honest limits

- Deterministic presence ≠ adequacy (a shipped `AILabel` might be hollow). The
  LLM tier (2) addresses this; until then the level is an *upper bound* on maturity.
- L5 not statically detectable → capped at L4.
- The `detectReservedAiTokens` source-vs-compiled gap (#139) still applies (Carbon's
  compiled `--cds-ai-*` tokens), so some L1 signals may be under-counted on
  compiled-CSS DSs — documented, not silently wrong.
