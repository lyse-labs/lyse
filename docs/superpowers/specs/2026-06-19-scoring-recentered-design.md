# Scoring — recentered design (semver gate + auto-fail cap + grade-primary)

> Issues: lyse-labs/lyse-internal #90 (score/semver), #87 (score/grades + auto-fails). #86 (0-3 anchors) DEFERRED.
> Status: approved (Noé, 2026-06-19) after an independent 3-expert panel recentered the original "scoring-v2 / 0-3 anchors" plan.

## Why this shape (the recenter)

An adversarial expert panel judged the original plan against the real codebase and Lyse's situation. Findings that reshaped it:
1. **Lyse already shipped a "formula v2"** (scorer.ts), and the absolute-cap lever `SCORING_K = 0` is **built and switched off**. The 0-3-anchor rework would be a *second* full rework that adds **no coverage and no precision** — it polishes internals the user never sees.
2. The score's real weakness is **substance/coverage** (62% covered, 38% gaps; Theming/Responsive/Motion at 1-2 rules), not its internal arithmetic. Coverage is what makes the score *more true*.
3. **Auto-fail vs one-score contradiction**: today `computeGrade` can return `grade: "Fail"` while `finalScore` reads 85 — two scores in a trench coat, the exact ambiguity a single score must avoid.
4. The external-validity anchor is **confirmed dead** (no public per-system holistic rating). Citing methodology lineage (Fluent) in the *rationale* is the only external-legitimacy lever left — but the product stays 100% Lyse-branded.

**Decision:** keep ONE Health Score on /100; do the cheap high-value pieces now (semver gate + auto-fail-that-caps + grade-as-primary + Fluent lineage citation); **defer the 0-3-anchor rework (#86)**; redirect effort to coverage.

## Constraints
- ONE public Health Score. Grade and tier are LABELS derived deterministically from the same number — they can NEVER disagree with it.
- §0ter determinism / local-first; no network. Rubric 100% Lyse-owned (Fluent cited as lineage in docs only, never branded/surfaced).
- A change to the v1 score output is semver-major; it must go through the gate (#90).

## Slice 1 — #90: scoring semver gate + v1 lock (foundational, NO score change)

- **Lock v1 byte-stable.** Snapshot-test the current `{finalScore, grade, tier, axes}` on representative inputs (`fixtures/full-ds/` + a few committed mini-fixtures spanning N/A, auto-fail, and mid-range cases). The snapshot is the v1 contract.
- **Migration gate test.** A test that recomputes the locked fixtures and FAILS if any v1 output changes UNLESS `CURRENT_SCORING_VERSION` was deliberately bumped (the test reads the pinned version; a changed score with an unchanged version = fail with a "bump scoringVersion or revert" message).
- **Migration doc** (`docs/architecture/scoring.md` section): the semver policy — what counts as a breaking score change, how to bump, what consumers (CI thresholds, telemetry, JSON) must re-baseline.
- No formula/behavior change in this slice; pure guard + docs. Ships safely on its own.

## Slice 2 — #87: auto-fail caps the number + grade-primary (a DELIBERATE scoring bump through the gate)

- **Auto-fail caps the number.** Replace the current "auto-fail sets `grade: Fail` independently" with: when an auto-fail condition holds, **cap `finalScore` into the Fail band** (`finalScore = min(rawScore, FAIL_CAP)` with `FAIL_CAP = 39`), then derive the grade from the capped score via the normal bands. Result: number and grade can never contradict; an auto-failing repo reads `39 / Fail`, not `85 / Fail`.
  - Auto-fail conditions for this slice = the EXISTING one only (≥ 2 axes scored 0). Adding new "critical-criterion" auto-fails is deferred (avoids extra score churn; revisit with bench data).
  - Surface a reason code (`capped: <reason>`) so a capped 39 is distinguishable from an earned 39.
- **Grade becomes the primary artifact.** Reporters (terminal/JSON summary) LEAD with the grade (A/B/C/Fail); the /100 number is secondary. Rationale: a /100 implies more precision than the model has; the grade is the honest-resolution headline. (JSON keeps `finalScore` for continuity + sorting — no field removed.)
- **Fluent lineage citation.** One factual sentence in `docs/architecture/scoring.md`: the anchored/auto-fail grading structure follows the pattern of published industry scorecards such as Microsoft Fluent 2 Responsible-AI — citation, not branding; nothing surfaced in product output.
- **Deliberate version bump.** This changes capped repos' scores → bump `CURRENT_SCORING_VERSION` (e.g. `scoring-v1.1`) through the Slice-1 gate and re-baseline the locked fixtures in the same PR (the gate's intended flow).

## Deferred (explicitly, with rationale)
- **#86 0-3 anchors per sub-axis** — gold-plating while coverage is at 62%; adds no coverage/precision; not a prerequisite for adding rules (sub-axes are 1:1 rule wrappers, additive). Revisit only if post-coverage bench data shows the aggregation is wrong.
- **Turning on `SCORING_K > 0`** (the rate cap) — a separate calibration needing a bench-corpus fit; out of this slice (the auto-fail cap delivers the "can't hide a fatal flaw" value without it).

## After this: coverage
The main effort moves to the ~17 deterministic-rule build issues filling the empty scopes (Documentation/Theming/Responsive/Motion/Components/A11y) via the proven rule→TDD→generators→recall→promote playbook. That is what makes the single Health Score more true.

## Testing
- Slice 1: snapshot tests (v1 lock) + the migration-gate test (bump-or-fail). No behavior change.
- Slice 2: unit tests that an auto-fail caps `finalScore` ≤ 39 and grade = Fail derived from it (number+grade consistent); a non-auto-fail score is unchanged from raw; reporter leads with grade; the version bump + re-baselined fixtures pass the gate.

## Out of scope
- 0-3 anchor model (#86), K recalibration, any second/parallel score, any product-surfaced "Fluent" reference, coverage rules (separate cycles).
