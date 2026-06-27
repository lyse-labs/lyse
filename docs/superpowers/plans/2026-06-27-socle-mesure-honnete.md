# Honest Measurement Foundation (Sub-project A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every reliability number Lyse publishes honest, per-rule, and reproducible in-repo — derived from an adversarial fixture corpus through the existing autonomous engine, with a real sample count `N` — and bring `tokens/no-hardcoded-color`, `tokens/no-hardcoded-shadow`, and `components/contracts-strictness` to a measured SLO, without touching the score contract.

**Architecture:** The autonomous validation engine (`packages/core/validation/`) already builds a per-rule confusion matrix from a clean fixture + mutation operators. We (1) extend the adapter to carry multiple adversarial negative fixtures (`falseFriends`) so precision becomes measurable, (2) add a pure `deriveMeasurement(matrix)` that turns a matrix into `{precision, recall, Wilson LBs, nSamples}` (reusing existing math), (3) make `sub-axes.ts` numbers verified-against-derived by a CI test (killing hand-pasted constants), (4) relax the `J=1` gate for experimental rules so we can add real false positives before fixing them, and (5) enrich `_skip-context.ts` to fix `color`. Status flips stay deferred to sub-project D.

**Tech Stack:** TypeScript (strict), vitest, tsx, the in-repo validation engine (`validation/run.ts`, `validation/adapters/*`), `scripts/render-coverage.ts`.

## Global Constraints

- Strict TypeScript: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`. Use `.js` import specifiers (ESM).
- Determinism byte-for-byte; no `Date.now()`/`Math.random()` in measured paths.
- TDD: every code step is test-first, watch-it-fail, minimal-pass, commit.
- The scorer (`packages/core/src/scorer.ts`) is NOT touched; no sub-axis flips `contributesToScore`; `CURRENT_SCORING_VERSION` is untouched.
- Rule metadata edited in the rule file via `createLyseRule`, never `manifest.ts`. SLO/sub-axes docs regenerated via `scripts/render-coverage.ts`, never hand-edited.
- Conventional Commits; one task = one commit; feature branch `feat/socle-mesure-honnete` (already created off `main`).
- Commit message trailers: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01MoiMorjpU4r6NaYfctP96w`.
- All artifacts in English.

## File Structure

- `packages/core/validation/types.ts` — add `falseFriends?` to `OracleAdapter`.
- `packages/core/validation/run-adapter.ts` — add one negative observation per false-friend.
- `packages/core/validation/run.ts` — gate `engineGateFailures` by sub-axis status.
- `packages/core/src/reliability/catalogue/measure.ts` — **new** `deriveMeasurement`.
- `packages/core/src/reliability/types.ts` — add `nSamples` to `SubAxisRecord`.
- `packages/core/src/reliability/catalogue/sub-axes.ts` — add `nSamples` to every entry.
- `packages/core/src/reliability/catalogue/promotion.ts` — add precision gate.
- `packages/core/tests/reliability/catalogue-coherence.test.ts` — **new** keystone test.
- `scripts/render-coverage.ts` — render the `N samples` column from `nSamples`.
- `packages/core/src/rules/_skip-context.ts` — AST-context enrichment for color.
- `packages/core/validation/adapters/tokens-no-hardcoded-color.ts` — adversarial false-friends.
- `packages/core/validation/adapters/*` (shadow, contracts) — corpora.

---

## Task 1: Extend the adapter to carry adversarial negative fixtures

**Files:**
- Modify: `packages/core/validation/types.ts:27-33`
- Modify: `packages/core/validation/run-adapter.ts:13-52`
- Test: `packages/core/tests/validation/false-friends.test.ts` (create)

**Interfaces:**
- Consumes: `OracleAdapter`, `FixtureFiles`, `ConfusionMatrix`, `evaluateAdapter`, `Probe` (from `validation/types.ts`, `run-adapter.ts`).
- Produces: `OracleAdapter.falseFriends?: FixtureFiles[]` — labelled NEGATIVE fixtures that MUST NOT flag; each adds one negative observation to the matrix. `evaluateAdapter` unchanged signature.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/validation/false-friends.test.ts
import { describe, it, expect } from "vitest";
import { evaluateAdapter } from "../../validation/run-adapter.js";
import type { OracleAdapter, FixtureFiles } from "../../validation/types.js";

const PKG = JSON.stringify({ name: "fx", version: "1.0.0" });

describe("false-friends add negative observations", () => {
  it("counts a wrongly-flagged false-friend as a false positive", async () => {
    const adapter: OracleAdapter = {
      ruleId: "demo/rule",
      oracleKind: "construction",
      cleanFixture: () => ({ "package.json": PKG, "a.css": ".x{color:var(--c)}" }),
      mutations: [{ name: "m", apply: (f: FixtureFiles) => ({ ...f, "a.css": ".x{color:#fff}" }) }],
      metamorphic: [],
      falseFriends: [{ "package.json": PKG, "b.css": ".y{color:#abc}" }],
    };
    // probe flags any fixture whose css contains a hex literal
    const probe = async (files: FixtureFiles) =>
      Object.values(files).some((c) => /#[0-9a-f]{3,6}\b/i.test(c));
    const score = await evaluateAdapter(adapter, probe);
    // clean: tn. mutation: tp. false-friend (has #abc): fp.
    expect(score.matrix).toEqual({ tp: 1, fp: 1, tn: 1, fn: 0 });
  });

  it("counts a correctly-ignored false-friend as a true negative", async () => {
    const adapter: OracleAdapter = {
      ruleId: "demo/rule",
      oracleKind: "construction",
      cleanFixture: () => ({ "package.json": PKG, "a.css": ".x{color:var(--c)}" }),
      mutations: [],
      metamorphic: [],
      falseFriends: [{ "package.json": PKG, "b.css": ".y{color:var(--ok)}" }],
    };
    const probe = async (files: FixtureFiles) =>
      Object.values(files).some((c) => /#[0-9a-f]{3,6}\b/i.test(c));
    const score = await evaluateAdapter(adapter, probe);
    expect(score.matrix).toEqual({ tp: 0, fp: 0, tn: 2, fn: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm vitest run tests/validation/false-friends.test.ts`
Expected: FAIL — `falseFriends` is not a known property of `OracleAdapter` (type error) and the matrix omits the extra negative.

- [ ] **Step 3: Add the field to the type**

In `packages/core/validation/types.ts`, add to `OracleAdapter` (after `metamorphic`):

```typescript
export interface OracleAdapter {
  ruleId: string;
  oracleKind: OracleKind;
  cleanFixture: () => FixtureFiles;
  mutations: MutationOperator[];
  metamorphic: MetamorphicPair[];
  /**
   * Labelled NEGATIVE fixtures — realistic code that resembles a violation but
   * is legitimate (token definitions, doc/example blocks, var() fallbacks…).
   * Each MUST NOT flag; each adds one negative observation to the matrix.
   * Harvested from real OSS code, not invented — this is what makes the
   * derived precision track reality.
   */
  falseFriends?: FixtureFiles[];
}
```

- [ ] **Step 4: Add the negative observations in the runner**

In `packages/core/validation/run-adapter.ts`, after the clean-fixture observation (line 21), before the mutations loop:

```typescript
  // Negative observations: each false-friend must NOT flag.
  for (const friend of adapter.falseFriends ?? []) {
    matrix = addObservation(matrix, false, await probe(friend, adapter.ruleId));
  }
```

- [ ] **Step 5: Run the tests and make sure they pass**

Run: `cd packages/core && pnpm vitest run tests/validation/false-friends.test.ts`
Expected: PASS (both cases).

- [ ] **Step 6: Commit**

```bash
git add packages/core/validation/types.ts packages/core/validation/run-adapter.ts packages/core/tests/validation/false-friends.test.ts
git commit -m "feat(validation): adapters carry adversarial false-friend negatives"
```

---

## Task 2: `deriveMeasurement` — confusion matrix → published metrics

**Files:**
- Create: `packages/core/src/reliability/catalogue/measure.ts`
- Test: `packages/core/tests/reliability/measure.test.ts` (create)

**Interfaces:**
- Consumes: `ConfusionMatrix` (from `validation/types.js`), `wilsonLowerBound` (from `catalogue/promotion.js`).
- Produces: `deriveMeasurement(m: ConfusionMatrix): Measurement` where
  `Measurement = { precisionMeasured: number | null; recallMeasured: number | null; precisionWilsonLowerBound: number | null; recallWilsonLowerBound: number | null; nSamples: number }`.
  `precision = tp/(tp+fp)`, `recall = tp/(tp+fn)`, each `null` when its denominator is 0; `nSamples = tp+fp+tn+fn`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/reliability/measure.test.ts
import { describe, it, expect } from "vitest";
import { deriveMeasurement } from "../../src/reliability/catalogue/measure.js";

describe("deriveMeasurement", () => {
  it("computes precision, recall, Wilson LBs and N from a matrix", () => {
    const m = deriveMeasurement({ tp: 9, fp: 1, tn: 20, fn: 0 });
    expect(m.precisionMeasured).toBeCloseTo(0.9, 10);
    expect(m.recallMeasured).toBe(1);
    expect(m.nSamples).toBe(30);
    expect(m.precisionWilsonLowerBound).toBeGreaterThan(0);
    expect(m.precisionWilsonLowerBound).toBeLessThan(0.9);
  });

  it("returns null precision when there are no positive predictions", () => {
    const m = deriveMeasurement({ tp: 0, fp: 0, tn: 5, fn: 0 });
    expect(m.precisionMeasured).toBeNull();
    expect(m.recallMeasured).toBeNull();
    expect(m.nSamples).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm vitest run tests/reliability/measure.test.ts`
Expected: FAIL — `Cannot find module '.../measure.js'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/src/reliability/catalogue/measure.ts
import type { ConfusionMatrix } from "../../../validation/types.js";
import { wilsonLowerBound } from "./promotion.js";

export interface Measurement {
  precisionMeasured: number | null;
  recallMeasured: number | null;
  precisionWilsonLowerBound: number | null;
  recallWilsonLowerBound: number | null;
  nSamples: number;
}

export function deriveMeasurement(m: ConfusionMatrix): Measurement {
  const predictedPos = m.tp + m.fp;
  const actualPos = m.tp + m.fn;
  return {
    precisionMeasured: predictedPos > 0 ? m.tp / predictedPos : null,
    recallMeasured: actualPos > 0 ? m.tp / actualPos : null,
    precisionWilsonLowerBound: predictedPos > 0 ? wilsonLowerBound(m.tp, predictedPos) : null,
    recallWilsonLowerBound: actualPos > 0 ? wilsonLowerBound(m.tp, actualPos) : null,
    nSamples: m.tp + m.fp + m.tn + m.fn,
  };
}
```

Note: the relative import path `../../../validation/types.js` crosses from `src/reliability/catalogue/` to `packages/core/validation/`. Verify it resolves; if `tsconfig`/`rootDir` rejects it, re-export `ConfusionMatrix` from `src/reliability/types.ts` and import from there instead.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd packages/core && pnpm vitest run tests/reliability/measure.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/reliability/catalogue/measure.ts packages/core/tests/reliability/measure.test.ts
git commit -m "feat(reliability): deriveMeasurement(matrix) -> precision/recall/Wilson/N"
```

---

## Task 3: Add `nSamples` to the catalogue schema and every entry

**Files:**
- Modify: `packages/core/src/reliability/types.ts:17-50`
- Modify: `packages/core/src/reliability/catalogue/sub-axes.ts` (all 65 entries)
- Test: `packages/core/tests/reliability/sub-axes-nsamples.test.ts` (create)

**Interfaces:**
- Produces: `SubAxisRecord.nSamples: number` (required). For not-yet-measured rules use `0`. Existing measured detectors keep their current precision values and get a provisional `nSamples` equal to the corpus size they will be re-measured against in Task 7+ (use `0` now; Task 5's coherence test only asserts rules that declare a corpus).

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/reliability/sub-axes-nsamples.test.ts
import { describe, it, expect } from "vitest";
import { SUB_AXES } from "../../src/reliability/catalogue/sub-axes.js";

describe("sub-axes nSamples", () => {
  it("every sub-axis declares a numeric nSamples", () => {
    for (const s of SUB_AXES) {
      expect(typeof s.nSamples, `${s.id} missing nSamples`).toBe("number");
      expect(s.nSamples).toBeGreaterThanOrEqual(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm vitest run tests/reliability/sub-axes-nsamples.test.ts`
Expected: FAIL — `nSamples` is `undefined` on every entry.

- [ ] **Step 3: Add the field to the type**

In `packages/core/src/reliability/types.ts`, add to `SubAxisRecord` after `recallWilsonLowerBound` (line 25):

```typescript
  /** Total labelled observations behind the measured metrics (tp+fp+tn+fn). 0 = not yet measured in-repo. */
  nSamples: number;
```

- [ ] **Step 4: Add `nSamples` to every entry in `sub-axes.ts`**

Add `nSamples: 0,` to each of the 65 records (after `recallWilsonLowerBound`). Mechanical: every entry gets the field; real values are written by Task 7+ for measured rules. Example for the color entry (line 8):

```typescript
{ id: "tokens.color", axis: "tokens", name: "Color tokens", status: "experimental", precisionMeasured: 0.4430379746835443, recallMeasured: 1, precisionWilsonLowerBound: 0.3386778751145434, recallWilsonLowerBound: 0.9035813714055363, nSamples: 0, lastCalibrated: "2026-06-15T16:54:07.177Z", contributesToScore: false, ruleIds: ["tokens/no-hardcoded-color"], llmDriven: false },
```

- [ ] **Step 5: Run the tests and make sure they pass**

Run: `cd packages/core && pnpm vitest run tests/reliability/sub-axes-nsamples.test.ts`
Expected: PASS. Also run `pnpm vitest run` to confirm no other test asserts the exact `SubAxisRecord` shape negatively.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/reliability/types.ts packages/core/src/reliability/catalogue/sub-axes.ts packages/core/tests/reliability/sub-axes-nsamples.test.ts
git commit -m "feat(reliability): add required nSamples to SubAxisRecord + all entries"
```

---

## Task 4: Render the `N samples` column from `nSamples`

**Files:**
- Modify: `scripts/render-coverage.ts:39-58`
- Test: `packages/core/tests/reliability/render-coverage-n.test.ts` (create)

**Interfaces:**
- Consumes: `SubAxisRecord.nSamples` (Task 3). Produces: `per-rule-slo.md` rows whose `N samples` column shows the integer, never `—`.

- [ ] **Step 1: Write the failing test**

Extract the row renderer so it is testable. First the test:

```typescript
// packages/core/tests/reliability/render-coverage-n.test.ts
import { describe, it, expect } from "vitest";
import { renderSloRow } from "../../../../scripts/render-coverage.js";
import type { SubAxisRecord } from "../../src/reliability/types.js";

const base: SubAxisRecord = {
  id: "tokens.spacing", axis: "tokens", name: "Spacing", status: "stable",
  precisionMeasured: 0.99, recallMeasured: 1,
  precisionWilsonLowerBound: 0.985, recallWilsonLowerBound: 0.90,
  nSamples: 142, lastCalibrated: "2026-06-18T00:00:00.000Z",
  contributesToScore: true, ruleIds: ["tokens/no-hardcoded-spacing"], llmDriven: false,
};

describe("per-rule SLO N column", () => {
  it("renders the real sample count, not a dash", () => {
    const row = renderSloRow(base);
    expect(row).toContain("| 142 |");
    expect(row).not.toMatch(/\|\s*—\s*\| 2026-06-18/); // N is not a dash
  });
});
```

(Adjust the relative path to `render-coverage.js` if the test runner's rootDir differs; the script lives at repo-root `scripts/`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm vitest run tests/reliability/render-coverage-n.test.ts`
Expected: FAIL — `renderSloRow` is not exported.

- [ ] **Step 3: Refactor the renderer + use `nSamples`**

In `scripts/render-coverage.ts`, replace the inline body of `renderPerRuleSlo` with an exported per-row function and a real N:

```typescript
export function renderSloRow(s: SubAxisRecord): string {
  const ruleColumn = s.ruleIds.length === 0
    ? "_(LLM-driven, no static rule)_"
    : s.ruleIds.map((id) => `\`${id}\``).join(", ");
  return `| ${ruleColumn} | \`${s.id}\` | ${fmtBound(s.precisionWilsonLowerBound)} | ${fmtBound(s.recallWilsonLowerBound)} | ${s.nSamples} | ${fmtDate(s.lastCalibrated)} |`;
}

function renderPerRuleSlo(rows: readonly SubAxisRecord[]): string {
  const stable = rows.filter((s) => s.status === "stable");
  const header = [
    "| Rule | Sub-axis | Precision (Wilson LB) | Recall (Wilson LB) | N samples | Last calibrated |",
    "|---|---|---|---|---|---|",
  ];
  if (stable.length === 0) {
    return [...header, "| _none yet_ | _no sub-axis is in `stable` status at this time_ | — | — | — | — |"].join("\n");
  }
  return [...header, ...stable.map(renderSloRow)].join("\n");
}
```

- [ ] **Step 4: Run the test + regenerate the docs**

Run: `cd packages/core && pnpm vitest run tests/reliability/render-coverage-n.test.ts` → PASS.
Run: `pnpm tsx scripts/render-coverage.ts` (from repo root) and confirm `docs/architecture/per-rule-slo.md` now shows integers in the N column.

- [ ] **Step 5: Commit**

```bash
git add scripts/render-coverage.ts packages/core/tests/reliability/render-coverage-n.test.ts docs/architecture/per-rule-slo.md docs/architecture/sub-axes.md
git commit -m "feat(docs): render real N samples in the per-rule SLO table"
```

---

## Task 5: Gate the engine by sub-axis status (unblock measuring imperfect rules)

**Files:**
- Modify: `packages/core/validation/run.ts:18-22`
- Test: `packages/core/tests/validation/gate-by-status.test.ts` (create)

**Interfaces:**
- Consumes: `EngineReport`, `RuleScore` (`validation/types.js`), `SUB_AXES` (`src/reliability/catalogue/sub-axes.js`).
- Produces: `engineGateFailures(report)` hard-fails (J<1 or inconsistency) ONLY for rules whose sub-axis is `status: "stable"`. Experimental rules are measured but never fail the gate — this is what lets us add real false positives to `color`/`shadow` before fixing them.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/validation/gate-by-status.test.ts
import { describe, it, expect } from "vitest";
import { engineGateFailures } from "../../validation/run.js";
import type { EngineReport } from "../../validation/types.js";

const mk = (ruleId: string, j: number): EngineReport["scores"][number] => ({
  ruleId, oracleKind: "construction",
  matrix: { tp: 1, fp: 1, tn: 0, fn: 0 }, youdensJ: j,
  metamorphicInconsistencies: [], mutationsRun: 1,
});

describe("engineGateFailures gates by status", () => {
  it("ignores J<1 for an experimental rule", () => {
    // tokens/no-hardcoded-color is experimental in the catalogue
    const report: EngineReport = { lyseVersion: "x", scores: [mk("tokens/no-hardcoded-color", 0.44)] };
    expect(engineGateFailures(report)).toHaveLength(0);
  });

  it("still fails J<1 for a stable rule", () => {
    // tokens/no-hardcoded-spacing is stable in the catalogue
    const report: EngineReport = { lyseVersion: "x", scores: [mk("tokens/no-hardcoded-spacing", 0.8)] };
    expect(engineGateFailures(report)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm vitest run tests/validation/gate-by-status.test.ts`
Expected: FAIL — the experimental color rule currently counts as a failure.

- [ ] **Step 3: Implement status-aware gating**

In `packages/core/validation/run.ts`, replace `engineGateFailures`:

```typescript
import { SUB_AXES } from "../src/reliability/catalogue/sub-axes.js";

const STABLE_RULE_IDS: ReadonlySet<string> = new Set(
  SUB_AXES.filter((s) => s.status === "stable").flatMap((s) => s.ruleIds),
);

export function engineGateFailures(report: EngineReport): RuleScore[] {
  return report.scores.filter(
    (s) =>
      STABLE_RULE_IDS.has(s.ruleId) &&
      (s.youdensJ < 1 || s.metamorphicInconsistencies.length > 0),
  );
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd packages/core && pnpm vitest run tests/validation/gate-by-status.test.ts` → PASS.
Run: `pnpm validate:autonomous` (repo root) and confirm it still reports `ENGINE GATE PASS` (no stable rule regressed).

- [ ] **Step 5: Commit**

```bash
git add packages/core/validation/run.ts packages/core/tests/validation/gate-by-status.test.ts
git commit -m "feat(validation): gate J=1 by sub-axis status; experimental rules measured not gated"
```

---

## Task 6: Keystone — catalogue-coherence test (numbers must equal derived)

**Files:**
- Create: `packages/core/tests/reliability/catalogue-coherence.test.ts`

**Interfaces:**
- Consumes: `runAll` (`validation/run.js`), `deriveMeasurement` (Task 2), `SUB_AXES`, the adapter list. Produces: a CI test asserting that for every rule that declares `falseFriends` (a real in-repo corpus), the catalogue's `precisionMeasured`/`recallMeasured`/Wilson LBs/`nSamples` equal the freshly derived values within 1e-9.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/reliability/catalogue-coherence.test.ts
import { describe, it, expect } from "vitest";
import { runAll } from "../../validation/run.js";
import { adapters } from "../../validation/adapters/index.js";
import { deriveMeasurement } from "../../src/reliability/catalogue/measure.js";
import { evaluateAdapter } from "../../validation/run-adapter.js";
import { SUB_AXES } from "../../src/reliability/catalogue/sub-axes.js";

const EPS = 1e-9;
const close = (a: number | null, b: number | null) =>
  a === null || b === null ? a === b : Math.abs(a - b) < EPS;

describe("catalogue coherence", () => {
  it("published metrics equal in-repo derived metrics for measured rules", async () => {
    const measured = adapters.filter((a) => (a.falseFriends?.length ?? 0) > 0);
    expect(measured.length, "no rule declares a measurement corpus yet").toBeGreaterThan(0);

    for (const adapter of measured) {
      const score = await evaluateAdapter(adapter);
      const m = deriveMeasurement(score.matrix);
      const sub = SUB_AXES.find((s) => s.ruleIds.includes(adapter.ruleId));
      expect(sub, `no sub-axis for ${adapter.ruleId}`).toBeDefined();
      if (!sub) continue;
      expect(close(sub.precisionMeasured, m.precisionMeasured), `${sub.id} precision`).toBe(true);
      expect(close(sub.recallMeasured, m.recallMeasured), `${sub.id} recall`).toBe(true);
      expect(close(sub.precisionWilsonLowerBound, m.precisionWilsonLowerBound), `${sub.id} precision LB`).toBe(true);
      expect(close(sub.recallWilsonLowerBound, m.recallWilsonLowerBound), `${sub.id} recall LB`).toBe(true);
      expect(sub.nSamples, `${sub.id} N`).toBe(m.nSamples);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm vitest run tests/reliability/catalogue-coherence.test.ts`
Expected: FAIL — no adapter declares `falseFriends` yet (`measured.length` is 0). This test goes green only once Task 7 lands a corpus AND the catalogue is updated to the derived numbers. That coupling is the point.

- [ ] **Step 3: No implementation yet — this test is the gate for Tasks 7-9**

Leave the test failing-by-emptiness is NOT acceptable to commit. Instead, mark it `it.skip` with a comment, and the FIRST detector task (Task 7) flips it to `it` in its own commit once a corpus exists. Implement the skip:

```typescript
  it.skip("published metrics equal in-repo derived metrics for measured rules", async () => {
```

- [ ] **Step 4: Commit**

```bash
git add packages/core/tests/reliability/catalogue-coherence.test.ts
git commit -m "test(reliability): add (skipped) catalogue-coherence keystone, enabled by Task 7"
```

---

## Task 7: `tokens/no-hardcoded-color` — adversarial corpus + AST fix + measure

**Files:**
- Modify: `packages/core/validation/adapters/tokens-no-hardcoded-color.ts`
- Modify: `packages/core/src/rules/_skip-context.ts`
- Modify: `packages/core/src/reliability/catalogue/sub-axes.ts` (the `tokens.color` row)
- Modify: `packages/core/tests/reliability/catalogue-coherence.test.ts` (un-skip)
- Test: `packages/core/tests/rules/tokens-no-hardcoded-color-false-friends.test.ts` (create)

**Interfaces:**
- Consumes: `OracleAdapter.falseFriends` (Task 1), `deriveMeasurement` (Task 2), the status gate (Task 5), `_skip-context` helpers.
- Produces: a measured `tokens.color` row whose numbers equal the derived ones; rule stays `experimental`/off-score.

- [ ] **Step 1: Write the failing test (real false-friends the rule must not flag)**

```typescript
// packages/core/tests/rules/tokens-no-hardcoded-color-false-friends.test.ts
import { describe, it, expect } from "vitest";
import { ruleFlagged } from "../../validation/audit-probe.js";

const PKG = JSON.stringify({ name: "fx", version: "1.0.0" });
const FRIENDS: Array<[string, Record<string, string>]> = [
  // color literal in a TOKEN DEFINITION file — legitimate, must not flag
  ["token-def", { "package.json": PKG, "tokens/colors.ts": 'export const colors = { blue500: "#2563eb" };' }],
  // literal inside a documentation <code> block
  ["doc-code", { "package.json": PKG, "Doc.tsx": 'export const D = () => <code>{"color: #2563eb"}</code>;' }],
  // var() fallback — the literal is a fallback, not a hardcode
  ["var-fallback", { "package.json": PKG, "a.css": ".x{ color: var(--fg, #2563eb); }" }],
];

describe("color rule ignores real false-friends", () => {
  for (const [name, files] of FRIENDS) {
    it(`does not flag: ${name}`, async () => {
      expect(await ruleFlagged(files, "tokens/no-hardcoded-color")).toBe(false);
    });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm vitest run tests/rules/tokens-no-hardcoded-color-false-friends.test.ts`
Expected: FAIL — the rule currently flags some of these (that is the 44 % precision). Note WHICH cases fail; those are the FP classes to suppress.

- [ ] **Step 3: Enrich `_skip-context.ts` to suppress the failing FP classes**

In `packages/core/src/rules/_skip-context.ts`, strengthen the relevant guards used by the color rule (the file already exposes `isColorTokenDefFile`, `isInsideCodeDisplay`, `isInVarFallback`). For each failing class from Step 2, extend the corresponding helper so the literal's AST/position is recognised as legitimate. Keep changes minimal and additive; do not relax checks that would drop recall. (Exact edits depend on Step 2 output — implement only the guards the failing cases require.)

- [ ] **Step 4: Run the false-friend test until green, then confirm recall is intact**

Run: `cd packages/core && pnpm vitest run tests/rules/tokens-no-hardcoded-color-false-friends.test.ts` → PASS.
Run: `cd packages/core && pnpm vitest run tests/rules/tokens-no-hardcoded-color.test.ts` → still PASS (recall preserved on known positives).

- [ ] **Step 5: Add the harvested false-friends to the adapter**

In `packages/core/validation/adapters/tokens-no-hardcoded-color.ts`, add a `falseFriends` array containing the legitimate cases (token-def files, doc/code blocks, var() fallbacks, swatch/picker render components, schema/default values) harvested from the vendored OSS repos under `.repos/`. Aim for `nSamples` (clean + falseFriends + mutations) ≥ 30. Each entry is a `FixtureFiles`.

- [ ] **Step 6: Measure and write the derived numbers into the catalogue**

Run the engine for just this rule to read its matrix:
```bash
cd packages/core && pnpm tsx -e "import {evaluateAdapter} from './validation/run-adapter.js'; import {colorAdapter} from './validation/adapters/tokens-no-hardcoded-color.js'; import {deriveMeasurement} from './src/reliability/catalogue/measure.js'; console.log(deriveMeasurement((await evaluateAdapter(colorAdapter)).matrix));"
```
Copy the printed `precisionMeasured`, `recallMeasured`, `precisionWilsonLowerBound`, `recallWilsonLowerBound`, `nSamples` into the `tokens.color` row of `sub-axes.ts`. Keep `status: "experimental"`, `contributesToScore: false`. Set `lastCalibrated` to a fixed ISO string (pass via the commit, not `Date.now()`).

- [ ] **Step 7: Un-skip the coherence test and run it**

Change `it.skip` back to `it` in `catalogue-coherence.test.ts`.
Run: `cd packages/core && pnpm vitest run tests/reliability/catalogue-coherence.test.ts` → PASS (color's catalogue numbers now equal the derived ones).

- [ ] **Step 8: Regenerate docs + full suite + engine gate**

Run: `pnpm tsx scripts/render-coverage.ts` (root).
Run: `cd packages/core && pnpm vitest run` → all green.
Run: `pnpm validate:autonomous` (root) → `ENGINE GATE PASS` (color is experimental, so J<1 does not fail the gate).

- [ ] **Step 9: Commit**

```bash
git add packages/core/validation/adapters/tokens-no-hardcoded-color.ts packages/core/src/rules/_skip-context.ts packages/core/src/reliability/catalogue/sub-axes.ts packages/core/tests/rules/tokens-no-hardcoded-color-false-friends.test.ts packages/core/tests/reliability/catalogue-coherence.test.ts docs/architecture/per-rule-slo.md docs/architecture/sub-axes.md
git commit -m "feat(tokens): measure color on adversarial in-repo corpus; suppress real FP classes"
```

---

## Task 8: `tokens/no-hardcoded-shadow` — first real measurement + harden

**Files:**
- Modify/Create: the shadow adapter under `packages/core/validation/` (it is produced via `hardcoded-value-adapters.ts` — locate the `shadow` spec there; if absent, add a dedicated `adapters/tokens-no-hardcoded-shadow.ts` and register it in `adapters/index.ts`).
- Modify: `packages/core/src/rules/_skip-context.ts` (only if FP classes surface).
- Modify: `packages/core/src/reliability/catalogue/sub-axes.ts` (the `tokens.shadow` row).
- Test: `packages/core/tests/rules/tokens-no-hardcoded-shadow-false-friends.test.ts` (create).

**Interfaces:**
- Same infra as Task 7. Produces a measured `tokens.shadow` row (was `precisionMeasured: null`), still `experimental`/off-score. Distinct from `components/no-native-shadows`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/rules/tokens-no-hardcoded-shadow-false-friends.test.ts
import { describe, it, expect } from "vitest";
import { ruleFlagged } from "../../validation/audit-probe.js";

const PKG = JSON.stringify({ name: "fx", version: "1.0.0" });
const FRIENDS: Array<[string, Record<string, string>]> = [
  ["token-def", { "package.json": PKG, "tokens/elevation.ts": 'export const e = { sm: "0 1px 2px rgba(0,0,0,.1)" };' }],
  ["var-usage", { "package.json": PKG, "a.css": ".x{ box-shadow: var(--shadow-sm); }" }],
  ["none-keyword", { "package.json": PKG, "a.css": ".x{ box-shadow: none; }" }],
];

describe("shadow rule ignores real false-friends", () => {
  for (const [name, files] of FRIENDS) {
    it(`does not flag: ${name}`, async () => {
      expect(await ruleFlagged(files, "tokens/no-hardcoded-shadow")).toBe(false);
    });
  }
});
```

- [ ] **Step 2: Run test to verify it fails (or passes — record which)**

Run: `cd packages/core && pnpm vitest run tests/rules/tokens-no-hardcoded-shadow-false-friends.test.ts`
Expected: any failing case = an FP class to suppress in Step 3. (Shadow has never been measured, so behaviour is unknown — record it.)

- [ ] **Step 3: Harden `_skip-context` only for the classes that failed**

Apply the same additive-guard approach as Task 7, Step 3. Skip if all cases already pass.

- [ ] **Step 4: Add false-friends to the adapter + positives**

Ensure the shadow adapter has mutations (hardcoded `box-shadow` literals) and a `falseFriends` array (the legitimate cases above + ones harvested from `.repos/`). Target `nSamples` ≥ 30.

- [ ] **Step 5: Measure + write derived numbers into the `tokens.shadow` row**

Same one-liner as Task 7 Step 6 (substitute the shadow adapter import). Copy derived values into `sub-axes.ts`; keep `experimental`/off-score; set fixed `lastCalibrated`.

- [ ] **Step 6: Run coherence + full suite + engine gate**

Run: `cd packages/core && pnpm vitest run tests/reliability/catalogue-coherence.test.ts` → PASS (now covers color + shadow).
Run: `cd packages/core && pnpm vitest run` → green. Run: `pnpm validate:autonomous` → PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/validation packages/core/src/rules/_skip-context.ts packages/core/src/reliability/catalogue/sub-axes.ts packages/core/tests/rules/tokens-no-hardcoded-shadow-false-friends.test.ts docs/architecture/per-rule-slo.md docs/architecture/sub-axes.md
git commit -m "feat(tokens): first real measurement of shadow on adversarial corpus"
```

---

## Task 9: `components/contracts-strictness` — measure + decide

**Files:**
- Modify/Create: the contracts-strictness adapter (locate in `validation/adapters/component-adapters.ts`; add `falseFriends`/mutations there or in a dedicated adapter).
- Modify: `packages/core/src/reliability/catalogue/sub-axes.ts` (the contracts-strictness row).
- Test: `packages/core/tests/rules/components-contracts-strictness-false-friends.test.ts` (create).

**Interfaces:** same infra. Produces a measured row. Decision rule: if `precisionWilsonLowerBound ≥ 0.90 && nSamples ≥ 30` → leave `experimental` but record it as promotion-ready (a `// promotion-ready` comment on the row + note in CHANGELOG); else keep `experimental` and document why in the rule doc.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/rules/components-contracts-strictness-false-friends.test.ts
import { describe, it, expect } from "vitest";
import { ruleFlagged } from "../../validation/audit-probe.js";

const PKG = JSON.stringify({ name: "fx", version: "1.0.0" });
const FRIENDS: Array<[string, Record<string, string>]> = [
  // a properly-typed component prop contract — must not flag
  ["typed-props", { "package.json": PKG, "Btn.tsx": "type P = { label: string }; export const Btn = (p: P) => <button>{p.label}</button>;" }],
];

describe("contracts-strictness ignores real false-friends", () => {
  for (const [name, files] of FRIENDS) {
    it(`does not flag: ${name}`, async () => {
      expect(await ruleFlagged(files, "components/contracts-strictness")).toBe(false);
    });
  }
});
```

- [ ] **Step 2: Run test to verify it fails (or record pass)**

Run: `cd packages/core && pnpm vitest run tests/rules/components-contracts-strictness-false-friends.test.ts`
Expected: record which cases fail → FP classes.

- [ ] **Step 3: Build the corpus + measure + decide**

Add mutations + `falseFriends` (≥ 30 observations, harvested from `.repos/`). Measure via the Task 7 one-liner (substitute the adapter). Write derived numbers into `sub-axes.ts`. Apply the decision rule above.

- [ ] **Step 4: Coherence + suite + gate**

Run: `cd packages/core && pnpm vitest run tests/reliability/catalogue-coherence.test.ts` → PASS (covers color + shadow + contracts).
Run: `cd packages/core && pnpm vitest run` → green. Run: `pnpm validate:autonomous` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/validation packages/core/src/reliability/catalogue/sub-axes.ts packages/core/tests/rules/components-contracts-strictness-false-friends.test.ts docs/architecture/per-rule-slo.md docs/architecture/sub-axes.md
git commit -m "feat(components): measure contracts-strictness on adversarial corpus; record decision"
```

---

## Task 10: Add the precision condition to the promotion gate

**Files:**
- Modify: `packages/core/src/reliability/catalogue/promotion.ts:20-32`
- Test: `packages/core/tests/reliability/promotion-precision-gate.test.ts` (create)

**Interfaces:**
- Consumes: nothing new. Produces: `shouldPromote` requires `precisionMeasured ≥ 0.90` in addition to `N ≥ 30` and the recall Wilson LB gate.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/reliability/promotion-precision-gate.test.ts
import { describe, it, expect } from "vitest";
import { shouldPromote } from "../../src/reliability/catalogue/promotion.js";

describe("promotion precision gate", () => {
  it("rejects when precision is below 0.90 even if recall clears", () => {
    expect(shouldPromote({ successes: 40, trials: 40, minSamples: 30, threshold: 0.90, precisionMeasured: 0.44 })).toBe(false);
  });
  it("accepts when precision, N and recall all clear", () => {
    expect(shouldPromote({ successes: 40, trials: 40, minSamples: 30, threshold: 0.90, precisionMeasured: 0.95 })).toBe(true);
  });
  it("rejects when precision is missing (unmeasured)", () => {
    expect(shouldPromote({ successes: 40, trials: 40, minSamples: 30, threshold: 0.90, precisionMeasured: null })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm vitest run tests/reliability/promotion-precision-gate.test.ts`
Expected: FAIL — `precisionMeasured` is not a field of `PromotionInput`; gate ignores precision.

- [ ] **Step 3: Implement the precision gate**

In `packages/core/src/reliability/catalogue/promotion.ts`:

```typescript
export interface PromotionInput {
  successes: number;
  trials: number;
  minSamples?: number;
  threshold?: number;
  /** Measured precision; promotion requires it to be >= 0.90. null = unmeasured = never promote. */
  precisionMeasured?: number | null;
}

export function shouldPromote(input: PromotionInput): boolean {
  const minSamples = input.minSamples ?? 30;
  const threshold = input.threshold ?? 0.90;
  if (input.trials < minSamples) return false;
  if (input.precisionMeasured == null || input.precisionMeasured < 0.90) return false;
  return wilsonLowerBound(input.successes, input.trials, 0.95) >= threshold;
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd packages/core && pnpm vitest run tests/reliability/promotion-precision-gate.test.ts` → PASS.
Run: `cd packages/core && pnpm vitest run` → confirm no existing caller of `shouldPromote` breaks (search `shouldPromote(` first; update callers to pass `precisionMeasured`).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/reliability/catalogue/promotion.ts packages/core/tests/reliability/promotion-precision-gate.test.ts
git commit -m "feat(reliability): promotion gate now requires precision >= 0.90"
```

---

## Task 11: Backfill in-repo corpora for the remaining stable sub-axes (no `—` for N)

**Files:**
- Modify: `packages/core/validation/hardcoded-value-adapters.ts`, `generic-presence-adapters.ts`, `tokens-structural-adapters.ts`, `vocabulary-adapters.ts`, `ai-surface-versioning-adapters.ts`, `component-adapters.ts` (add `falseFriends` to the factory specs).
- Modify: `packages/core/src/reliability/catalogue/sub-axes.ts` (write derived numbers + N into every stable row).
- Test: extend `catalogue-coherence.test.ts` to assert ALL stable sub-axes (not just those with corpora) are derived-and-verified; add a "no stable row has nSamples 0" test.

**Interfaces:** Consumes all infra above. Produces: every stable sub-axis has a real in-repo `nSamples` and catalogue numbers equal to derived. This is the bulk of A and replaces the externally-pasted lyse-bench constants (the bench remains the future real-world validation, separate sub-project).

> **Right-sizing note for the executor:** the 7 numeric detectors (`spacing`, `z-index`, `opacity`, `border-radius`, `border-width`, `motion`, `typography`) need real adversarial false-friends like color did — do each as its own commit using the Task 7 pattern (test → harden → corpus → measure → write → verify). The ~38 deterministic presence checks (`deterministicValidator: true`) get a minimal corpus via `makePresenceAdapter`; their precision is structural (1.0) so the corpus mainly establishes a real N. Group the presence checks by factory into a few commits, not 38.

- [ ] **Step 1: Tighten the coherence test to cover all stable rules**

```typescript
// add to catalogue-coherence.test.ts
it("no stable sub-axis reports nSamples 0", () => {
  for (const s of SUB_AXES) {
    if (s.status === "stable") expect(s.nSamples, `${s.id}`).toBeGreaterThan(0);
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/core && pnpm vitest run tests/reliability/catalogue-coherence.test.ts`
Expected: FAIL — stable rows still have `nSamples: 0`.

- [ ] **Step 3: Add corpora family-by-family, measure, write numbers (one commit per family)**

For each family, add `falseFriends` to the factory spec, run the measurement one-liner per rule, and write the derived `precisionMeasured`/`recallMeasured`/Wilson LBs/`nSamples` into `sub-axes.ts`. Re-run the coherence test after each family.

- [ ] **Step 4: Final verification**

Run: `cd packages/core && pnpm vitest run` → all green.
Run: `pnpm validate:autonomous` → `ENGINE GATE PASS`.
Run: `pnpm tsx scripts/render-coverage.ts` → confirm `per-rule-slo.md` shows NO `—` in the N column for any stable row, and the previously-repeated `0.901…` Wilson LBs are now distinct per rule.

- [ ] **Step 5: Commit (per family) + CHANGELOG + changeset**

```bash
git add packages/core/validation packages/core/src/reliability/catalogue/sub-axes.ts packages/core/tests/reliability/catalogue-coherence.test.ts docs/architecture/per-rule-slo.md docs/architecture/sub-axes.md
git commit -m "feat(reliability): in-repo measurement corpus for <family>; real N, distinct Wilson LBs"
```
After the last family, add a CHANGELOG `[Unreleased]` entry and a changeset (`pnpm changeset`) describing the credibility change (per-rule N, reproducible numbers). No score change.

---

## Self-Review

**1. Spec coverage:**
- "nSamples end-to-end" → Tasks 3, 4, 11. ✓
- "Measurement derivation module" → Task 2. ✓
- "Catalogue-coherence test" → Task 6 (scaffold), 7-9-11 (enable/extend). ✓
- "Promotion precision gate" → Task 10. ✓
- "color ≥ 0.90 target, honest if not" → Task 7 (measures; experimental until it clears). ✓
- "shadow first real measurement" → Task 8. ✓
- "contracts-strictness measure + decide" → Task 9. ✓
- "no score change" → Global Constraints; no task flips `contributesToScore`. ✓
- "adapter needs multiple negatives; J=1 must not block experimental rules" → Tasks 1, 5. ✓
- DoD "no `—` for N on any stable row" → Task 11. ✓

**2. Placeholder scan:** Step 3 of Tasks 7-9 ("enrich only the guards the failing cases require") is data-dependent on Step 2 output by design — the test code and the harvest sources (`.repos/`) are concrete; the specific guard edits cannot be pre-written without the FP list. This is a measure-then-fix loop, not a placeholder. All other steps contain runnable code/commands.

**3. Type consistency:** `Measurement` (Task 2) field names match `SubAxisRecord` (`precisionMeasured`, `recallMeasured`, `precisionWilsonLowerBound`, `recallWilsonLowerBound`, `nSamples`). `OracleAdapter.falseFriends` (Task 1) consumed in Task 6/7. `PromotionInput.precisionMeasured` (Task 10) is new and self-contained. `ConfusionMatrix` shape `{tp,fp,tn,fn}` consistent throughout.

## Risks carried from the spec

- Color may not reach 0.90 — DoD is honest number + N, not forced 0.90; it stays experimental.
- Synthetic ≠ real-world — false-friends harvested from `.repos/`, Bench is the later real-world gate.
- Task 11 is the bulk; it can be executed as its own follow-up if A is shipped incrementally (Tasks 1-10 already deliver the infra + the 3 named detectors + honest N for those).
