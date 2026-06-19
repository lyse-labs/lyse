# Scoring Semver Gate + v1 Lock (#90) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock the current v1 Health-Score output as a versioned contract and add a migration gate so any silent change to the v1 score fails CI unless the scoring version is deliberately bumped.

**Architecture:** A single contract test audits the canonical `fixtures/full-ds` fixture via `auditDirectory` and asserts its `{finalScore, tier, grade, axes}` equals a `LOCKED` table keyed by `CURRENT_SCORING_VERSION`. The lock IS the gate: a formula change makes the assertion fail with a "bump the version or revert" message. No formula/behavior change in this slice.

**Tech Stack:** TypeScript (strict, NodeNext `.js` specifiers), vitest. Deterministic (no `Date.now`/`Math.random`).

## Global Constraints

- NO change to the scoring formula, grade logic, or any score output in this slice — pure guard + docs.
- `CURRENT_SCORING_VERSION = "scoring-v1"` (src/reliability/score/version-pin.ts) — a change to the v1 score output is semver-major and must go through this gate.
- Determinism: the audit of `fixtures/full-ds` must be byte-stable; use `{ staticOnly: true }`.
- One Health Score; grade + tier are labels — the lock captures all three exactly as v1 emits them today (including current quirks; #87 will change them via a deliberate bump).
- Strict TS, NodeNext `.js` import specifiers, no comments unless WHY is non-obvious.
- Run tests: `cd packages/core && pnpm vitest run tests/scoring-contract.test.ts`.

---

## File Structure

- Create `packages/core/tests/scoring-contract.test.ts` — the v1 lock + migration-gate test.
- Modify `docs/architecture/scoring.md` — add a "Scoring semver policy" section.
- Modify `CHANGELOG.md` — `[Unreleased]` entry.

---

### Task 1: v1 contract lock + migration gate test

**Files:**
- Create: `packages/core/tests/scoring-contract.test.ts`

**Interfaces:**
- Consumes: `auditDirectory(repoRoot: string, flags?: { staticOnly?: boolean }): Promise<{ result }>` from `../src/commands/audit-pipeline.js` (result has `finalScore`, `tier`, `grade`, `axes`, `scoringVersion`); `CURRENT_SCORING_VERSION` from `../src/reliability/score/version-pin.js`.
- Produces: nothing imported by later tasks (a leaf test).

- [ ] **Step 1: Write the test (it should PASS immediately — it locks current behavior)**

```typescript
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { auditDirectory } from "../src/commands/audit-pipeline.js";
import { CURRENT_SCORING_VERSION } from "../src/reliability/score/version-pin.js";

// Repo root from packages/core/tests/ → up 3 (tests → core → packages → root).
const FULL_DS = join(import.meta.dirname, "..", "..", "..", "fixtures", "full-ds");

// The versioned v1 scoring contract. RULE: a change to a score output is
// semver-major. To change it, bump CURRENT_SCORING_VERSION and ADD a new entry
// here keyed by the new version — NEVER silently edit an existing version's
// locked values. The test below turns a silent change into a CI failure.
const LOCKED: Record<string, {
  finalScore: number | "N/A";
  tier: string;
  grade: { grade: string; autoFailed: boolean; reasons: string[] };
  axes: { axis: string; score: number | "N/A" }[];
}> = {
  "scoring-v1": {
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
};

describe("scoring contract — semver gate (#90)", () => {
  it("declares the current scoring version in the audit output", async () => {
    const { result } = await auditDirectory(FULL_DS, { staticOnly: true });
    expect(result.scoringVersion).toBe(CURRENT_SCORING_VERSION);
  });

  it("fixtures/full-ds matches the locked contract for the current scoring version", async () => {
    const { result } = await auditDirectory(FULL_DS, { staticOnly: true });
    const actual = {
      finalScore: result.finalScore,
      tier: result.tier,
      grade: result.grade,
      axes: result.axes.map((a) => ({ axis: a.axis, score: a.score })),
    };

    const locked = LOCKED[CURRENT_SCORING_VERSION];
    expect(
      locked,
      `No locked contract for scoring version "${CURRENT_SCORING_VERSION}". If you bumped the version, ADD its entry to LOCKED in this file.`,
    ).toBeDefined();

    expect(
      actual,
      `full-ds score output changed under "${CURRENT_SCORING_VERSION}". A score change is semver-major: bump CURRENT_SCORING_VERSION and add a NEW LOCKED entry (do not edit an existing version's values), or revert the change.`,
    ).toEqual(locked);
  });
});
```

- [ ] **Step 2: Run it — expect PASS (locks current behavior)**

Run: `cd packages/core && pnpm vitest run tests/scoring-contract.test.ts`
Expected: 2/2 PASS.

> If `actual` differs from the LOCKED values, the discrepancy is real — the values above were captured from `node dist/cli.js audit fixtures/full-ds --static-only --format=json`. If `auditDirectory` in-test yields different numbers, UPDATE the LOCKED `scoring-v1` entry to the in-test values (run once, read the diff the test prints, paste the actual object) — the lock must reflect what `auditDirectory` actually produces, since that is what the gate guards. Do NOT change any source file to force a match.

- [ ] **Step 3: Verify the gate FAILS on a simulated silent change (then revert the simulation)**

Temporarily edit the LOCKED `scoring-v1.finalScore` to `34`, run the test, confirm it FAILS with the "score output changed … bump … or revert" message, then revert it back to `33`. (This proves the gate actually guards; do not commit the temporary edit.)

Run: `cd packages/core && pnpm vitest run tests/scoring-contract.test.ts` (after the temp edit → FAIL; after revert → PASS).

- [ ] **Step 4: Commit**

```bash
git add packages/core/tests/scoring-contract.test.ts
git commit -m "test(score): lock v1 Health-Score contract + semver migration gate (#90)"
```

---

### Task 2: Scoring semver policy doc + CHANGELOG

**Files:**
- Modify: `docs/architecture/scoring.md`
- Modify: `CHANGELOG.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Add the semver policy section to `docs/architecture/scoring.md`**

Append a section (read the file first to match its heading style/level):

```markdown
## Scoring semver policy

The Health Score is a **public contract**. Consumers pin it via `scoringVersion`
in the audit output (`CURRENT_SCORING_VERSION`, today `scoring-v1`).

- **Any change to a score output** — the `finalScore` formula, axis weighting,
  grade thresholds/auto-fail logic, or tier banding — is a **semver-major**
  change to the score, even when the JSON schema is unchanged.
- Such a change MUST: (1) bump `CURRENT_SCORING_VERSION`, and (2) add a new
  entry to the `LOCKED` table in `packages/core/tests/scoring-contract.test.ts`
  keyed by the new version. Never edit an existing version's locked values.
- The contract test (`#90`) turns any silent score drift into a CI failure,
  forcing the bump-or-revert decision to be explicit.
- Consumers (CI score thresholds, dashboards, telemetry) should re-baseline
  when `scoringVersion` changes; a changed version signals "the same input may
  now score differently."
```

- [ ] **Step 2: Add the CHANGELOG entry**

Under `## [Unreleased]` (match the file's subsection style, e.g. `### Added`):

```markdown
- Scoring semver gate: the v1 Health-Score output is now locked as a versioned contract; any change requires a deliberate `scoringVersion` bump (lyse-labs/lyse-internal#90).
```

- [ ] **Step 3: Verify the doc link/section renders**

Run: `cd packages/core && pnpm build` (confirms no doc-referenced path broke). Manually confirm the new `scoring.md` section has no broken relative links.

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/scoring.md CHANGELOG.md
git commit -m "docs(score): scoring semver policy + changelog (#90)"
```

---

## Self-Review

**1. Spec coverage (Slice 1 of the design):**
- v1 byte-stable lock → Task 1 (LOCKED + full-ds assertion). ✓
- Migration-gate semantics (bump-or-fail, version-keyed) → Task 1 (LOCKED keyed by CURRENT_SCORING_VERSION + the failure messages + Step 3 proof). ✓
- Semver policy doc → Task 2. ✓
- NO score change this slice → Global Constraints + Task 1 locks current behavior (test passes as-is). ✓
- (Slice 2 #87 auto-fail-cap + grade-primary, and #86 deferral, are out of THIS plan by design.)

**2. Placeholder scan:** No TBD/TODO; complete code/values in every step. The locked values are concrete (captured from the real audit); the one `>` note is a verify-against-reality fallback, not a placeholder.

**3. Type consistency:** `auditDirectory(root, { staticOnly })` → `{ result }` with `finalScore`/`tier`/`grade`/`axes`/`scoringVersion`; `CURRENT_SCORING_VERSION` string; `LOCKED` shape matches the asserted `actual` shape. Consistent across the single test file.
