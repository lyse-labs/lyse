# color — AST confidence grading — Design

> Step 2 of "color → 90%". Follow-on to the lexical guards (Step 1, ~65% precision
> on all findings, recall ~100%). Stacked on `feat/color-to-90`. The rigorous
> measurement showed 90% precision on ALL color findings is not honestly reachable
> with lexical detection (ceiling ~85-88%; some literals are structurally
> indistinguishable from drift). This step makes 90% reachable HONESTLY by grading
> confidence from the literal's AST role and scoring only the high-confidence set.

## Goal

Use the color literal's **semantic role in the AST** to grade each finding's
`confidence`. Findings in clear drift contexts (authored styling) are **high
confidence** and count toward the scored precision; findings in functional /
ambiguous roles (canvas `fillStyle`, default prop values, SVG art) are **low
confidence** — surfaced but NOT counted in the scored precision. Target:
**precision ≥ 0.90 on the high-confidence subset**, with high-confidence recall
maintained. If cleared, promote color into the score (dedicated v2→v3 bump).

## The integrity guardrail (non-negotiable — this is what keeps 90% honest)

Confidence grading must NOT become a dumping ground for false positives we
cannot otherwise suppress. Two hard rules:

1. **Low confidence is reserved for genuine functional/non-drift AST roles** —
   each low-confidence demotion must be justified by a concrete AST signal
   (assignment target, default-value position, SVG-art element), never "this
   looks like an FP we couldn't fix."
2. **High-confidence recall is measured and must stay high.** We verify that
   real drift is NOT being mislabeled low-confidence to inflate precision. If a
   labelled true-drift finding lands in low-confidence, that is a recall defect
   on the scored set, not a precision win.

A reviewer/measurement that cannot confirm both is a failed gate.

## What already exists (reuse)

- `classifyConfidence?: (finding: Finding, ctx: ClassifyContext) => Confidence`
  on the rule contract (`src/types.ts:229`). The color rule ALREADY defines one
  (`tokens-no-hardcoded-color.ts:520`) — this step EXTENDS it with AST role
  signals.
- `Finding.confidence: "high" | "medium" | "low"` field.
- Report modes: `--verbose` (`cli.ts:193`, "show all findings") + terminal
  reporter `mode === "verbose"` (`terminal.ts:77`). Default report shows top-5.
- ts-morph AST (`src/parsers/ts-morph-project.ts`) for TS/JSX role analysis.

## Architecture

```
color literal detected (post Step-1 lexical guards)
        │
        ▼
classifyConfidence(finding, ctx)  ── AST role analysis (ts-morph) ──►  confidence
        │   high = authored styling drift context
        │   low  = functional/ambiguous role (canvas fillStyle, default prop, svg art)
        ▼
scoring/measurement: precision computed on HIGH-confidence findings only
default report: high-confidence only · --verbose + handoff payload: all (badged)
        │
        ▼  iff high-confidence precision ≥ 0.90 ∧ recall ∧ N ≥ 30
promote color into the score (v2→v3 bump + LOCKED entry)
```

### Low-confidence AST role taxonomy (the demotion signals)

A detected color literal is demoted to **low confidence** iff its AST context
matches a functional/non-drift role:

- **Canvas 2D context:** assignment to a `.fillStyle` / `.strokeStyle` /
  `.shadowColor` member (the literal is a rendering instruction, not a DS token
  use).
- **Default value position:** the literal is the default of a color-ish prop or
  parameter (`color = "#xxx"` in a destructured prop / default param /
  `defaultProps`) — a functional fallback.
- **SVG art:** `fill` / `stroke` on an SVG element in JSX (icon/illustration
  art), complementing the path-based `isSvgIconContext` from Step 1.
- **(decided below)** low-alpha `rgba`/`hsla` overlay/shadow values.

Everything else (a color literal in a CSS declaration, a styled-component style
object property, a `style={{ color: "#xxx" }}` inline style on a normal element,
an arbitrary Tailwind className color) stays **high confidence** — clear drift.

**rgba/hsla overlays decision:** low-alpha `rgba(0,0,0,0.x)` overlays/shadows are
genuinely fuzzy (arguably should be shadow/overlay tokens). To avoid weakening
the drift signal, they stay **high confidence by default** (they ARE drift —
shadows should be tokens); only the three roles above demote. This keeps the
low-confidence set principled and narrow. (Revisit only if measurement shows
they dominate the residual without being real drift.)

## Scoring mechanism

- The measured precision/recall for `tokens.color` is computed on
  **high-confidence findings only**. Low-confidence findings are reported-only.
- The scorer counts only high-confidence color findings toward the score (when
  color is promoted). Implementation: filter color findings by
  `confidence === "high"` in the scored path; low-confidence remain in the audit
  output (verbose/handoff) with their badge.
- This is a scoring-semantics change — gated behind the v2→v3 bump (it ships
  only with promotion). Until promotion, color stays experimental and the
  confidence grading is informational.

## Measurement & promotion

- Re-label the harvest corpus findings by confidence (high/low) per the AST
  taxonomy, then measure precision = high-confidence-TP / high-confidence-flagged.
- Verify high-confidence recall: of labelled true-drift findings, the fraction
  landing in high-confidence (must stay high — the integrity guardrail).
- Reproducible in-repo via vendored fixtures + the catalogue-coherence test.
- **Conditional promotion:** iff high-confidence precision ≥ 0.90 ∧ recall ≥ 0.90
  ∧ N ≥ 30 → `status: stable`, `contributesToScore: true`, `CURRENT_SCORING_VERSION`
  v2→v3, `LOCKED` entry, docs. Else stays experimental with the honest number.

## Global constraints

- Strict TS; ESM `.js`. Determinism byte-for-byte; no Date.now()/Math.random();
  `lastCalibrated` fixed string.
- AST analysis via the shared ts-morph project; degrade gracefully (a literal
  whose AST role can't be determined stays high confidence — never silently
  demote on parse failure, that would hide real drift).
- No LLM in the score (confidence grading is deterministic AST analysis).
- Recall non-regression: high-confidence must still catch the real drift Step 1
  catches; CSS-only files (no AST) are unaffected (stay high confidence).
- Conventional Commits; branch `feat/color-to-90`. All artifacts English.

## Risks

- **Confidence-as-dumping-ground** → the integrity guardrail (principled roles +
  measured high-confidence recall).
- **AST role ambiguity** → only demote on clear AST signals; default to high
  confidence when uncertain (favor recall over precision in the grading).
- **High-confidence set too narrow** (if most real drift lives in ambiguous
  contexts) → measurement will show it; honest fallback (experimental, real
  number published). 90% is NOT guaranteed even here — some drift genuinely lives
  in functional-looking contexts.
- **CSS findings have no JS AST** → they stay high confidence (CSS declarations
  are clear drift), so CSS recall/precision is unaffected by this step.

## Non-goals

- LLM-assisted classification (forbidden in score).
- Re-opening the Step-1 lexical guards (done).
- Other detectors; other sub-projects.
