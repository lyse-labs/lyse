# color → 90% — real-world precision — Design

> Follow-on to sub-project A (honest measurement foundation). Stacked on
> `feat/socle-mesure-honnete`. Reuses A's infra (`falseFriends`,
> `deriveMeasurement`, the catalogue-coherence test, the status-gated engine,
> the precision promotion gate). One rule only: `tokens/no-hardcoded-color`.

## Goal

Raise `tokens/no-hardcoded-color` to **≥ 0.90 precision on a real, labelled
sample of its findings on real OSS code** (it was ~44% on real code; the
synthetic in-repo number from A — precision 1.0 / Wilson LB 0.51 — does NOT
reflect real precision), while **holding recall ≥ 0.90**. If it clears the gate,
**promote it into the score** via a dedicated `scoring-v2 → v3` bump. This is the
#1 expert ask, and it doubles as the local prototype of the real-world Bench.

## Acceptance (Definition of Done)

- Precision **≥ 0.90** and recall **≥ 0.90** measured on a labelled real sample
  (target N ≈ 150), reproducible in-repo via vendored fixtures + the A
  coherence test.
- **Conditional promotion:** iff the gate is cleared → `status: "stable"`,
  `contributesToScore: true`, `CURRENT_SCORING_VERSION` bumped v2→v3, new
  `LOCKED` entry in `scoring-contract.test.ts`, docs regenerated.
- If the rule does **not** reach the gate after honest AST enrichment → it stays
  `experimental` / off-score, the real measured number + N are published, no
  score bump, and the report states which FP classes remain unsolved. Honesty
  over forcing the number — we do NOT tune fixtures or the rubric to pass.

## Labelling rubric (what "drift" means — decided)

When `color` flags a color literal, it is labelled:

- **TP (real drift):** the literal sits in code that **styles UI** — CSS, SCSS,
  CSS-in-JS (styled-components/emotion/vanilla-extract), inline `style`, or an
  arbitrary `className` value (`bg-[#fff]`). I.e. "this color should reference a
  token."
- **FP (legitimate literal — must be suppressed):** token-definition files;
  stories / tests / examples / fixtures; data / chart / syntax-highlight
  palettes; SVG / icon art; configuration and data files. These are not DS drift.

Keywords (`transparent`, `currentColor`, `inherit`) and `var()` fallbacks are not
tokenizable drift.

## Ground truth (decided: local public-OSS harvest)

1. Clone ~5–10 **public** OSS design systems (e.g. Radix Primitives, MUI,
   Chakra, shadcn/ui, Mantine) into a **git-ignored** working dir (no network at
   audit time after the one-time clone; not committed).
2. Run `color` across them; collect **all** findings.
3. **Sample ~150** findings, stratified by repo and file type (so no single repo
   or file class dominates).
4. **Label each** against the rubric. The controller labels the mechanical cases
   directly; the genuinely **ambiguous tail (~10–20)** is surfaced to the human
   for batch adjudication. Ambiguity calls and their resolution are recorded.

**Anti-bias rule:** labels are assigned from the **real code context**, never
from "what makes the rule pass." A finding whose correct label is FP stays FP
even if the rule currently flags it — that is the gap we then close.

## Architecture / flow

```
clone public OSS DS (gitignored)
        │  run color, collect findings
        ▼
sample ~150 (stratified)  ──►  label (rubric; ambiguous tail → human)
        │
        ▼
enumerate REAL FP classes (the ones dragging precision to ~44%)
        │  one TDD cycle per class
        ▼
narrow AST guards in _skip-context.ts   (recall non-regression gate: existing TPs still flag)
        │
        ▼
vendor labelled real snippets → fixtures/reliability/color/{positive,false-friend}/
        │  (anonymised where needed)
        ▼
color adapter falseFriends/positives ← these fixtures
        │  engine matrix → deriveMeasurement (A)
        ▼
catalogue tokens.color row == derived (coherence test, A)   precision/recall/N real
        │
        ▼  iff precision ≥ 0.90 ∧ recall ≥ 0.90 ∧ N ≥ ~30
promote: status stable + contributesToScore true + scoring v2→v3 + LOCKED entry + docs
```

### Design units

1. **Harvest+label artifact** — a labelled findings set (real snippet + file
   context + label + rubric-reason). Lives as a committed data file +
   the vendored fixtures distilled from it. The raw cloned repos are gitignored.
2. **FP-class guards** — narrow additions to `_skip-context.ts`, one per real FP
   class, each with a fixture from a real example and a recall-preserving test.
3. **Measurement** — reuses A's `deriveMeasurement` + coherence test; no new
   measurement code.
4. **Promotion** — the conditional scoring change (its own unit, gated on the
   measured result).

## Reproducibility

The labelled real snippets are vendored as in-repo fixtures, so the precision
number is **reproducible and falsifiable** without re-cloning: A's
catalogue-coherence test re-derives `tokens.color`'s numbers from them and fails
on any drift. `nSamples` = the labelled fixture count. The raw cloned repos
themselves are git-ignored (not committed); only the distilled labelled snippets
are committed.

## Testing strategy

- Per FP class: a fixture from a **real** flagged snippet + a test asserting the
  rule does NOT flag it, plus the recall-preservation gate (existing positive
  tests + a sample of real TPs still flag).
- The coherence test binds the published number to the fixtures.
- `pnpm validate:autonomous` stays green (color experimental until promoted; if
  promoted, it must hit J=1 on its construction oracle too).
- Full `packages/core` suite green; if promoted, `scoring-contract.test.ts` gets
  the new locked v3 values and the v2 entry is left untouched.

## Risks

- **Labelling bias / "teaching to the test."** Mitigated by rubric-from-real-
  context labelling and human adjudication of the ambiguous tail. The recall gate
  prevents "fix precision by suppressing real drift."
- **May not reach 0.90.** Accepted: honest number published, no bump, unsolved FP
  classes named. Some FP classes (e.g. CSS-in-JS theme objects that ARE token
  definitions) may need real AST work that lands short — that is a finding, not a
  failure.
- **Recall regression.** Each guard is narrow; the existing TP suite + a real-TP
  sample are a non-regression gate.
- **Score bump blast radius.** Promotion changes every repo's score (v2→v3) —
  this is the deliberate, documented, single-purpose bump the user approved;
  `scoring-contract.test.ts` makes it explicit.

## Global constraints

- Strict TS (exactOptionalPropertyTypes, noUncheckedIndexedAccess,
  verbatimModuleSyntax); ESM `.js`.
- Determinism byte-for-byte; no Date.now()/Math.random(); `lastCalibrated` a
  fixed string.
- Cloned repos git-ignored, never committed; only distilled labelled snippets
  committed. Snippets carry attribution/license note if required by the source.
- TDD per FP class; recall non-regression gate on every guard change.
- Conventional Commits; feature branch `feat/color-to-90` (stacked on
  `feat/socle-mesure-honnete`).
- All artifacts in English.
- The score changes ONLY if the gate is cleared, and only via an explicit
  `CURRENT_SCORING_VERSION` bump + `LOCKED` entry.

## Non-goals

- Other detectors (shadow, etc.) — same method later; this is color only.
- The full 70-repo Bench / Gate B (lyse-internal) — this local harvest is its
  prototype, not its replacement.
- Sub-projects B / C / D; Figma.
