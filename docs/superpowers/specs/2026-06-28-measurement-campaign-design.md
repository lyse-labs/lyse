# Measurement campaign — Design

> Generalize the color harvest harness to ALL rules, measure real precision on
> the local lyse-bench corpus, and produce a per-rule promotability report.
> No billing/CI needed (local clone + local audit). Human validation is the
> gate for detection-rule precision; the autonomous first pass does
> clone + harvest + auto-label structural rules + LLM-judge detection rules +
> human packets.

## Goal

Every experimental rule ships unmeasured because synthetic construction-oracle
precision is an artifact of mutation count (the color finding) and cannot gate
promotion. Real promotion needs real-corpus precision. This campaign measures
all rules against the local lyse-bench tier-1 corpus and outputs a per-rule
report identifying which rules clear the promotion gate (precision Wilson
LB ≥ 0.90 ∧ recall ≥ gate), which are walled (like color), and which await
human label validation. The report feeds the deferred v2→v3 score bump.

This is the SAME harness used for color (`scripts/harvest-color-findings.ts`):
the real `auditDirectory` pipeline so every guard applies, findings emitted with
source context + AST confidence, then labelled. Color was one rule, hand-
labelled. This generalizes to all rules and adds (a) deterministic auto-labelling
for structural rules and (b) an LLM-judge pre-label for detection rules so the
human labels only uncertain cases.

## Substrate reused (not rewritten)

- `scripts/harvest-color-findings.ts` — the auditDirectory-based harvest (color).
  Generalize to all rules.
- `src/llm/filter-stage.ts` — the #115 conformal precision filter: rubric +
  three-way verdict (`violation`/`fp`/`uncertain`) + self-reported confidence.
- `src/llm/connectors/agent-cli-adapter.ts` — LLM via the agent CLI (Claude
  Code), so the judge runs with NO API key / NO billing.
- `lyse-bench/corpus/tier1.yaml` — 20 OSS DS repos with pinned SHAs.
- `populateConfidence` / `buildClassifyContext` (`codemods/safety.ts`) — AST
  confidence grading, already used by the color harness.

## Corpus

Clone the 20 tier-1 repos at their pinned SHAs into a gitignored local dir
(`.bench-corpus/`, add to `.gitignore`). Deterministic (SHAs fixed). Network is
available; billing is irrelevant (no CI). tier-2 (50 repos) is an optional later
volume extension, not in scope for the first pass.

## Architecture

### Rule taxonomy (drives the labelling path)

- **Structural / presence rules** (auto-labelable): rules that flag an ABSENCE
  or a malformed STRUCTURE — e.g. `tokens/dtcg-conformance`,
  `ai-surface/component-manifest-json`, `ai-surface/component-manifest-completeness`,
  `ai-surface/ds-index-exported`, `ai-surface/mcp-config-present`,
  `ai-surface/llms-txt-structure`, `ai-surface/agents-md-quality`,
  `versioning/changelog-present`, `versioning/semver-versioning`,
  `versioning/migration-guide-present`, `versioning/deprecation-markers`, and
  the deterministic ai-governance presence checks. Precision is decidable by
  re-inspecting the repo (the file genuinely is/ isn't there / is/ isn't valid).
- **Detection rules** (LLM-judge + human gate): rules that flag a value or
  pattern in code — token hardcoding, `no-arbitrary-tailwind`,
  `no-style-escape-hatch`, `standardized-variant-props`, `contracts-strictness`,
  `no-native-shadows`, icon rules, the static a11y rules, story-content rules.
  Each finding's TP/FP needs judgement.
- **Render-only rules** (out of scope this pass): `a11y/runtime-axe`,
  `tokens/rendered-token-fidelity` — need `--render` + a built Storybook. Logged
  as "not measured (render lane)" so the report does not silently imply
  coverage.

The taxonomy is declared explicitly in the harness (a `RULE_MEASURE_KIND` map),
not inferred — so a reviewer can audit the classification.

### Harness (`scripts/harvest-findings.ts`)

Generalize the color harness: for each cloned repo, run
`auditDirectory(repo, { staticOnly: true })`, and for every finding emit a row:
`{ ruleId, repo, file, line, snippet (±2 lines), fileType, confidence }` →
`.bench-corpus/findings/<ruleId>.jsonl`. Same fidelity guarantee as color (the
real pipeline, all guards applied).

### Labelling

- **Structural rules** → `autoLabel(finding, repo)`: deterministic check that the
  flagged absence/structure is genuinely a true positive (e.g. the named file is
  absent at the repo path; the manifest entry genuinely lacks the field). Emits
  `tp`/`fp` with a recorded reason. No LLM.
- **Detection rules** → the `filter-stage` rubric via the agent-cli connector:
  pre-label each finding `violation`/`fp`/`uncertain` + confidence. Findings the
  judge marks confidently (above the conformal threshold) are labelled
  `tp`/`fp` and ANNOTATED `llm-provisional`. `uncertain` / low-confidence
  findings go into a human packet (`.bench-corpus/packets/<ruleId>.md` — snippet
  + judge note, for the user to mark TP/FP).

### Recall (honest)

Real-corpus recall needs known positives, which the bench does not label. Recall
stays the existing synthetic/seeded measure (the adapters' positive fixtures +
metamorphic mutations) and is explicitly tagged `recall: synthetic` in the
report — never presented as real-corpus recall.

### Output (`docs/superpowers/measurement-report.md` + `.json`)

Per rule: `precisionMeasured` (real, on N findings), `precisionWilsonLowerBound`,
`nSamples`, `recall` (synthetic), `labelSource` (`auto` / `llm-provisional` /
`human-validated`), and a verdict bucket: **promotable** (precision Wilson
LB ≥ 0.90 ∧ recall gate ∧ label `auto` or `human-validated`), **walled**
(measured < gate, like color), **pending-human** (only `llm-provisional` labels
so far), **not-measured** (render-only). The deterministic JSON is the input the
later v2→v3 bump consumes.

## Critical honesty constraints

- An `llm-provisional` precision number NEVER promotes a rule. Promotion
  requires `auto` (structural) or `human-validated` (detection) labels. This
  mirrors the color lesson: only real, validated labels gate promotion.
- The campaign's FIRST pass writes NO changes to `sub-axes.ts` — it produces the
  harness + reports + packets only. Promotion (catalogue edits + the v2→v3 bump)
  is a SEPARATE, later step gated on human validation and the #223 merge.
- The report records N and the label source per rule, so a reader can see
  exactly how each number was produced (no hidden synthetic-as-real).
- Render-only rules are reported as not-measured, never as 100%.

## Testing

- Harness unit tests: `RULE_MEASURE_KIND` covers every registry rule (parity
  test — no rule unclassified); `autoLabel` correctness on fixture findings
  (a genuinely-absent file → tp; a present-but-flagged → fp); the JSONL row
  shape; deterministic ordering.
- The LLM-judge path is tested with an injected fake connector (zero real
  spawn), mirroring `filter-stage`'s existing test pattern.
- The campaign RUN itself is a script invocation, not a vitest target; its
  output (the report) is the deliverable, reviewed by a human.

## Architecture / files

- Create: `scripts/harvest-findings.ts` (general harness), `scripts/clone-bench-corpus.ts`
  (clone tier-1 at pinned SHAs), `scripts/measure-rules.ts` (orchestrate:
  harvest → label → report).
- Create: `packages/core/src/reliability/measure/rule-measure-kind.ts`
  (the explicit taxonomy map + a parity test).
- Create: `tests/tools/harvest-findings.test.ts`, the rule-measure-kind parity test.
- Output (gitignored corpus; committed reports): `.bench-corpus/` (gitignored),
  `docs/superpowers/measurement-report.{md,json}`.
- Modify: `.gitignore` (add `.bench-corpus/`), `package.json` (script entries
  `clone:bench`, `measure:rules`).

## Global constraints

- Strict TS; ESM `.js`. Determinism where possible (pinned SHAs; sorted output;
  the LLM-judge is non-deterministic and its rows are tagged `llm-provisional`).
- No billing/CI dependency. No score change in this pass (reports only).
- No comments unless WHY is non-obvious. English only. Conventional Commits.
- Runs on `feat/color-to-90` (measures the current 73-rule set) or a branch off
  it; the report is committable, the corpus is not.

## Non-goals

- Catalogue promotion / the v2→v3 score bump (separate, post-validation,
  post-merge).
- Render-lane measurement (`--render`, Storybook) — a later extension.
- tier-2 (50 repos) — optional volume extension after the tier-1 first pass.
- The `prefer-existing-component` rule (a separate sub-project the user will
  scope next).
