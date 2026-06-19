# Scoring auto-fail cap + grade-primary (#87) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make an auto-fail CAP the numeric Health Score (not just relabel it) so the number, tier, and grade can never contradict — a deliberate `scoring-v1.1` bump through the #90 gate.

**Architecture:** Move the auto-fail (≥2 axes scored 0) from `grade.ts` into `scorer.ts`: it now caps `finalScore` into the Fail band (`min(score, 39)`) and recomputes the tier on the capped score. `grade.ts` becomes a pure band of `finalScore` + an `autoFailed` flag carried from the scorer. Bump the scoring version + re-baseline the locked contract.

**Tech Stack:** TypeScript (strict, NodeNext `.js`), vitest. Deterministic.

## Global Constraints
- ONE Health Score: grade and tier are pure functions of the (capped) `finalScore` — they can never disagree with it.
- The auto-fail condition this slice = the EXISTING one only: **≥ 2 axes scored 0**. No new conditions (avoids extra score churn).
- `FAIL_CAP = 39` (top of the Fail band; Fail = score < 40). Cap to 39, not 0 — "Fail, but not everything is broken."
- This CHANGES the score for repos with ≥2 zero-axes AND raw ≥ 40 → a semver-major bump: `CURRENT_SCORING_VERSION` → `"scoring-v1.1"`, and add a `LOCKED["scoring-v1.1"]` entry in `tests/scoring-contract.test.ts` (the #90 gate). full-ds is raw 33 → capped min(33,39)=33 → its locked output is UNCHANGED (same values, new version key).
- Preserve the exact auto-fail reason string `"${n} axes scored 0: ${sortedAxes.join(", ")}"` so full-ds's locked `grade.reasons` is unchanged.
- Strict TS, NodeNext `.js`, no comments unless WHY non-obvious.
- Tests: `cd packages/core && pnpm vitest run tests/scorer.test.ts tests/reliability/grade.test.ts tests/scoring-contract.test.ts` (create the first two paths if absent; mirror existing test locations).

---

## File Structure
- Modify `packages/core/src/scorer.ts` — cap finalScore on auto-fail; add `autoFail` to `ScoreResult`.
- Modify `packages/core/src/reliability/grade.ts` — `computeGrade(finalScore, autoFail?)` pure band + flag.
- Modify `packages/core/src/commands/audit-pipeline.ts:447` — pass `scoring.autoFail` to `computeGrade`.
- Modify `packages/core/src/reliability/score/version-pin.ts` — bump to `scoring-v1.1`.
- Modify `packages/core/tests/scoring-contract.test.ts` — add `LOCKED["scoring-v1.1"]`.
- Tests: scorer unit test (cap) + grade unit test (pure band + flag).
- Modify `docs/architecture/scoring.md` (Fluent lineage citation) + `CHANGELOG.md`.

---

### Task 1: Cap finalScore on auto-fail (scorer) + pure-band grade

**Files:**
- Modify: `packages/core/src/scorer.ts`, `packages/core/src/reliability/grade.ts`, `packages/core/src/commands/audit-pipeline.ts`
- Test: `packages/core/tests/scorer.test.ts` (or the existing scorer test file — confirm), `packages/core/tests/reliability/grade.test.ts` (confirm path)

**Interfaces:**
- Produces: `ScoreResult.autoFail?: { reasons: string[] }`; `computeGrade(finalScore: number | "N/A", autoFail?: { reasons: string[] }): GradeResult`.

- [ ] **Step 1: Failing scorer unit test (the cap)**

In the scorer test file, add (confirm the import path for `score`):
```typescript
import { score } from "../src/scorer.js";

it("auto-fail (>=2 zero axes) caps finalScore into the Fail band", () => {
  const zero = { errorCount: 1, warningCount: 0, infoCount: 0 };
  const clean = { errorCount: 0, warningCount: 0, infoCount: 0 };
  const r = score(
    { tokens: zero, "ai-surface": zero, components: clean, a11y: clean,
      stories: clean, "ai-governance": clean },
    { tokens: 1, "ai-surface": 1, components: 1, a11y: 1, stories: 0, "ai-governance": 0 },
  );
  // raw mean of [0,0,100,100] = 50; two zero axes → capped to 39.
  expect(r.finalScore).toBe(39);
  expect(r.autoFail?.reasons).toEqual(["2 axes scored 0: ai-surface, tokens"]);
  expect(r.tier).toBe(/* scoreTotier(39) — fill from the run; tier of 39 */ r.tier);
});

it("no auto-fail leaves finalScore uncapped", () => {
  const clean = { errorCount: 0, warningCount: 0, infoCount: 0 };
  const r = score(
    { tokens: clean, a11y: clean, components: clean, stories: clean,
      "ai-surface": clean, "ai-governance": clean },
    { tokens: 1, a11y: 1, components: 1, stories: 0, "ai-surface": 0, "ai-governance": 0 },
  );
  expect(r.finalScore).toBe(100);
  expect(r.autoFail).toBeUndefined();
});
```
(For the `tier` assertion, after the first run read the real `scoreTotier(39)` value and pin it.)

- [ ] **Step 2: Run → expect FAIL** (`finalScore` currently 50, no `autoFail`). `cd packages/core && pnpm vitest run tests/scorer.test.ts`

- [ ] **Step 3: Implement the cap in `scorer.ts`**

Add near `SCORING_K`: `const FAIL_CAP = 39;`. Extend `ScoreResult` (interface ~line 59) with `autoFail?: { reasons: string[] };`. Replace the final return block (currently lines ~154-160):
```typescript
  if (activeAxisScores.length === 0) {
    return { finalScore: "N/A", tier: "N/A", axes, scoringK: SCORING_K };
  }
  const avg = activeAxisScores.reduce((s, x) => s + x, 0) / activeAxisScores.length;
  let finalScore = Math.round(avg);

  // Auto-fail (#87): >=2 axes scored 0 caps the score into the Fail band, so the
  // number, tier, and grade can never contradict each other.
  const zeroAxes = axes
    .filter((a) => a.score === 0)
    .map((a) => a.axis)
    .sort((a, b) => a.localeCompare(b));
  let autoFail: { reasons: string[] } | undefined;
  if (zeroAxes.length >= 2) {
    finalScore = Math.min(finalScore, FAIL_CAP);
    autoFail = { reasons: [`${zeroAxes.length} axes scored 0: ${zeroAxes.join(", ")}`] };
  }

  return {
    finalScore,
    tier: scoreTotier(finalScore),
    axes,
    scoringK: SCORING_K,
    ...(autoFail ? { autoFail } : {}),
  };
```

- [ ] **Step 4: Simplify `grade.ts` to a pure band + flag**

Replace `computeGrade`:
```typescript
export function computeGrade(
  finalScore: number | "N/A",
  autoFail?: { reasons: string[] },
): GradeResult {
  if (finalScore === "N/A") {
    return { grade: "N/A", autoFailed: false, reasons: [] };
  }
  return {
    grade: bandGrade(finalScore),
    autoFailed: autoFail !== undefined,
    reasons: autoFail?.reasons ?? [],
  };
}
```
(Keep `bandGrade` as-is. The old `axes`/`zeroAxes` logic is removed — the scorer's cap now guarantees a capped score lands in the Fail band, and `bandGrade(39)` = "Fail", so number and grade agree by construction.)

- [ ] **Step 5: Update the call site** `packages/core/src/commands/audit-pipeline.ts:447`
```typescript
  const grade = computeGrade(scoring.finalScore, scoring.autoFail);
```

- [ ] **Step 6: Run unit tests → PASS** (`scorer.test.ts` + `grade.test.ts`). Add/adjust a grade test: `computeGrade(39, { reasons: ["x"] })` → `{grade:"Fail", autoFailed:true, reasons:["x"]}`; `computeGrade(85)` → `{grade:"A", autoFailed:false, reasons:[]}`; `computeGrade("N/A")` → N/A. Fix any other test that called `computeGrade(score, axes)` with the old signature (grep for `computeGrade(`).

- [ ] **Step 7: Commit**
```bash
git add packages/core/src/scorer.ts packages/core/src/reliability/grade.ts packages/core/src/commands/audit-pipeline.ts packages/core/tests/scorer.test.ts packages/core/tests/reliability/grade.test.ts
git commit -m "feat(score): auto-fail caps finalScore so number/tier/grade can't contradict (#87)"
```

---

### Task 2: Version bump + re-baseline the contract + Fluent citation

**Files:**
- Modify: `packages/core/src/reliability/score/version-pin.ts`, `packages/core/tests/scoring-contract.test.ts`, `docs/architecture/scoring.md`, `CHANGELOG.md`

- [ ] **Step 1: Bump the version**

`version-pin.ts`: `export const CURRENT_SCORING_VERSION = "scoring-v1.1" as const;`

- [ ] **Step 2: Run the contract test → expect FAIL** (no `LOCKED["scoring-v1.1"]`). `cd packages/core && pnpm vitest run tests/scoring-contract.test.ts` — fails with "No locked contract for scoring version scoring-v1.1".

- [ ] **Step 3: Add the v1.1 locked entry**

In `tests/scoring-contract.test.ts`, add to `LOCKED` (full-ds is raw 33 → capped 33 → unchanged values; copy the v1 entry under the new key, then run to confirm it matches reality):
```typescript
  "scoring-v1.1": {
    finalScore: 33,
    tier: "Managed",
    grade: { grade: "Fail", autoFailed: true, reasons: ["2 axes scored 0: ai-surface, tokens"] },
    axes: [
      { axis: "tokens", score: 0 },
      { axis: "a11y", score: "N/A" },
      { axis: "components", score: 100 },
      { axis: "stories", score: "N/A" },
      { axis: "ai-surface", score: 0 },
      { axis: "ai-governance", score: "N/A" },
    ],
  },
```
Run the contract test → PASS. (If any value differs from reality, set it to the actual audited output — do not change source to force a match.)

- [ ] **Step 4: Fluent lineage citation in `docs/architecture/scoring.md`**

Add one factual sentence to the "Scoring semver policy" section (or a short "Grading lineage" note): "Lyse's auto-fail / banded-grade structure follows the pattern of published industry scorecards such as Microsoft's Fluent 2 Responsible-AI scorecard — a methodology reference, not a product dependency." (Citation only; nothing surfaced in product output.)

- [ ] **Step 5: CHANGELOG**

Under `## [Unreleased]` → `### Changed`:
```markdown
- Health Score `scoring-v1.1`: an auto-fail (≥2 axes scored 0) now caps the numeric score into the Fail band, so the score, tier, and grade are always consistent (previously the grade could read Fail while the number stayed high) (lyse-labs/lyse-internal#87).
```

- [ ] **Step 6: Full scoring suite + commit**
```bash
cd packages/core && pnpm vitest run tests/scorer.test.ts tests/reliability/grade.test.ts tests/scoring-contract.test.ts tests/cli.score-smoke.test.ts
git add packages/core/src/reliability/score/version-pin.ts packages/core/tests/scoring-contract.test.ts docs/architecture/scoring.md CHANGELOG.md
git commit -m "feat(score): bump scoring-v1.1 (auto-fail cap) + relock contract + Fluent lineage (#87)"
```

---

### Task 3: Grade-primary in the terminal reporter

**Files:** Modify `packages/core/src/reporters/terminal.ts` (confirm path) + its test.

- [ ] **Step 1**: Read the terminal reporter; find where the score is printed. Make the GRADE (A/B/C/Fail) the leading element of the score line, with the `/100` number secondary (e.g. `Grade: Fail (33/100)` instead of leading with `33/100`). Keep all data; only reorder emphasis. If an `autoFailed` reason exists, append it (e.g. `— 2 axes scored 0`).

- [ ] **Step 2**: Update the reporter's test snapshot/assertions to the new ordering. Run the reporter test → PASS.

- [ ] **Step 3: Commit**
```bash
git add packages/core/src/reporters/terminal.ts packages/core/tests/<reporter test>
git commit -m "feat(score): terminal reporter leads with the grade, number secondary (#87)"
```

---

## Self-Review
**1. Spec coverage (Slice 2):** auto-fail caps the number → Task 1; grade pure function of capped score → Task 1 (grade.ts); deliberate version bump through the gate + relock → Task 2; Fluent lineage citation → Task 2; grade-primary → Task 3. ✓
**2. Placeholders:** complete code in each code step; the two `>`/inline "confirm path / pin tier" notes are verify-against-reality, not placeholders.
**3. Type consistency:** `ScoreResult.autoFail?: {reasons:string[]}` produced by scorer, consumed by `computeGrade(finalScore, autoFail?)` and the pipeline call site; `FAIL_CAP=39`; `CURRENT_SCORING_VERSION="scoring-v1.1"` matches the new LOCKED key. Consistent.
