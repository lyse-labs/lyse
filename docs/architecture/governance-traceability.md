# Governance Traceability Map

Each LLM grader rubric dimension is traced to one or more canonical guidelines from
[Microsoft HAX (Human-AI Experience) G1–G18](https://www.microsoft.com/en-us/research/project/guidelines-for-human-ai-interaction/)
and the [Google PAIR Guidebook](https://pair.withgoogle.com/guidebook/) chapters.

The authoritative source of truth is `GUIDELINE_TRACEABILITY_MAP` exported from
`packages/core/src/llm/rubric.ts`. This document is a human-readable mirror of that
constant and must stay in sync with it.

## Dimension → Guideline Mapping

| Dimension key | Title | Canonical guidelines | Rationale |
|---|---|---|---|
| `human-control-enforced` | Human control actually enforced | HAX G8, HAX G9, PAIR Human Control | HAX G8 (efficient correction) and G9 (efficient dismissal) require that users can correct or stop AI output without friction. PAIR Human Control reinforces that control affordances must be reachable and functional, not decorative. |
| `voice-anti-anthropomorphism` | Voice, tone & anti-anthropomorphism | HAX G4, PAIR Explainability | HAX G4 (show contextually) cautions against misleading framing; PAIR Explainability explicitly requires that systems do not claim sentience or false agency, keeping the AI voice honest about what it is. |
| `explanation-quality` | Explanation quality | HAX G11, PAIR Explainability | HAX G11 (make clear why) requires that explanations surface the actual reasoning, inputs, and confidence behind AI output rather than a generic placeholder. PAIR Explainability mandates actionable, specific explanations. |
| `risk-classification` | Risk classification of the AI feature | HAX G1, HAX G2, PAIR Safety | HAX G1 (make clear what the system can do) and G2 (make clear how well the system can do what it can do) define the capability-framing and disclaimer requirements proportionate to risk. PAIR Safety covers proportionate safeguards for high-impact AI actions. |
| `value-gate-judgment` | Is AI even needed (value gate) | HAX G18, PAIR Augmentation | HAX G18 (encourage appropriate use) requires that AI is applied only where it genuinely adds value over deterministic alternatives. PAIR Augmentation frames AI as a tool that augments human capability — not a default substitute for simpler solutions. |
| `recovery-flow-behavioral` | AI error recovery flow (behavioral) | HAX G7, PAIR Error Recovery | HAX G7 (support efficient invocation) includes recovery from failure as part of the interaction contract; AI error states must offer a wired path back. PAIR Error Recovery requires graceful degradation and actionable retry or fallback paths. |
| `explainability-coverage-behavioral` | Explainability coverage & layering (behavioral) | HAX G11, PAIR Explainability | HAX G11 (make clear why the system did what it did) applies at every AI output render site, not just where a global affordance exists. PAIR Explainability requires layered What → Why → How structure so users can evaluate and act on AI output. |

## Valid Canonical Guideline IDs

The following ids are accepted by the `VALID_GUIDELINE_IDS` set in `rubric.ts`.
Any guideline id used in `GUIDELINE_TRACEABILITY_MAP` must appear in this list.

**Microsoft HAX G1–G18**

`HAX G1` `HAX G2` `HAX G3` `HAX G4` `HAX G5` `HAX G6` `HAX G7` `HAX G8` `HAX G9`
`HAX G10` `HAX G11` `HAX G12` `HAX G13` `HAX G14` `HAX G15` `HAX G16` `HAX G17` `HAX G18`

**Google PAIR Guidebook chapters**

`PAIR Explainability` `PAIR Human Control` `PAIR Safety` `PAIR Feedback`
`PAIR Augmentation` `PAIR Error Recovery` `PAIR Onboarding` `PAIR Data`

## How guideline ids surface in grader output

Each dimension prompt (built by `buildDimensionPrompt` in `rubric.ts`) now includes:

1. A `Canonical guidelines:` header line listing the mapped ids.
2. A trailing instruction requiring the LLM to cite the relevant guideline id(s) in
   every finding message it emits.

This mirrors the convention used by static rules such as
`ai-governance/explainability-affordance` and `ai-governance/human-control-affordances`,
which already embed `HAX G11` and `HAX G8/G9` in their finding messages.

## Keeping this document in sync

When you update `GUIDELINE_TRACEABILITY_MAP` in `rubric.ts`, update the table above
to match. The test `traceability map is consistent with getRubricDimensions() guidelines field`
will catch any drift between the map and the `guidelines` field on each dimension.
