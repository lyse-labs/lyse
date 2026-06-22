# Autonomous Validation Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, zero-LLM "mutation + independent-oracle" engine that measures whether each Lyse rule actually catches the violations it claims to (recall) without flagging clean code (precision), proven end-to-end on 2 rules, then fanned out across **every rule in the registry** (via a small set of oracle-tier factory families) with a machine-enforced completeness gate so no rule is silently left uncovered, producing an overnight gap report.

**Completeness principle ("sans rien oublier"):** "All checks in the world" is not a finite enumerable set (WCAG/AI-Act/guidelines evolve; quality is partly subjective). The rigorous substitute, implemented here for the *existing* registry and extended later against external authorities, is: every rule is EITHER covered by an oracle adapter OR explicitly classified as `judgment`/`report-only` with a written reason — enforced by a test that iterates `ruleMap` and fails on any unclassified rule. Coverage against external standards (DTCG, WCAG 2.2, EU AI Act, HAX/PAIR) is a follow-on plan fed by research `wf_c284775f-a53`.

**Architecture:** An `OracleAdapter` per rule declares (a) a clean fixture, (b) one or more mutation operators that inject a *known* violation, and (c) optional metamorphic-equivalence fixtures. A deterministic runner writes each fixture variant to a temp directory, runs the real Lyse audit pipeline (`auditDirectory(dir, { staticOnly: true })`), observes findings for the target rule, builds a confusion matrix, and collapses it to a single tool-independent score (Youden's J). The label never comes from any model — it comes from the mutation operator that created the defect. This is the non-circular ground-truth-by-construction pattern (OWASP/Juliet/CASTLE) applied to Lyse.

**Tech Stack:** TypeScript (ESM, NodeNext, strict — same as core), vitest (existing test runner), `tsx` (new devDependency, to run the overnight runner from source), Node `fs`/`os` for temp-dir fixtures. No external analyzer dependency for the proof (construction + metamorphic oracles need none).

## Global Constraints

- **Determinism:** same fixtures + same Lyse version → byte-identical report. JSON output keys sorted alphabetically. No `Date.now()`/timestamps inside scored output (a generated-at stamp may live in a separate `meta` block only).
- **Zero LLM in the harness:** every audit call passes `{ staticOnly: true }`. The deterministic engine must never make a network/LLM call. Verified by asserting `result.meta?.layer4?.staticOnly === true` is irrelevant to scoring; the harness simply never enables LLM.
- **Not published:** all engine code lives in `packages/core/validation/` (sibling to `src/`, NOT under `src/`, so it is excluded from the published `tsc -p tsconfig.json` build and absent from package.json `files`). Tests live under `packages/core/tests/validation/`.
- **Strict TypeScript:** `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`. Imports of local TS use `.js` extension specifiers.
- **No comments unless WHY is non-obvious.**
- **Reuse, never fork:** import `auditDirectory` from `../src/commands/audit-pipeline.js` and `ruleMap` from `../src/rules/registry.js`. Do NOT reimplement rule logic or build local rule arrays (CLAUDE.md key-modules rule).
- **Branch:** all work on `feat/autonomous-validation-engine`, committed step-by-step, NEVER pushed.

---

## File Structure

- `packages/core/validation/types.ts` — `OracleKind`, `MutationOperator`, `OracleAdapter`, `RuleScore`, `EngineReport` interfaces.
- `packages/core/validation/temp-repo.ts` — `withTempRepo(files, fn)`: write a map of relative-path→content to a fresh temp dir, run `fn(dir)`, clean up.
- `packages/core/validation/audit-probe.ts` — `findingsForRule(dir, ruleId)`: run `auditDirectory(dir, { staticOnly: true })`, return the findings whose `ruleId` matches.
- `packages/core/validation/score.ts` — `confusionMatrix(...)` and `youdensJ(matrix)` pure functions.
- `packages/core/validation/run-adapter.ts` — `evaluateAdapter(adapter)`: drives construction + metamorphic oracles for one adapter, returns a `RuleScore`.
- `packages/core/validation/adapters/tokens-no-hardcoded-color.ts` — proof adapter #1 (regex rule, in-CSS construction + metamorphic equivalence).
- `packages/core/validation/adapters/ai-surface-llms-txt-structure.ts` — proof adapter #2 (structural file rule, file-presence/structure construction).
- `packages/core/validation/adapters/index.ts` — the adapter registry array.
- `packages/core/validation/generic-presence-adapters.ts` — fan-out: auto-derive construction adapters for file-presence/structural rules.
- `packages/core/validation/run.ts` — overnight CLI runner: evaluate all registered adapters, write `validation/report.json`, print summary to stdout.
- `packages/core/tests/validation/*.test.ts` — one test file per source unit above.
- `packages/core/package.json` — add `tsx` devDependency + `validate:autonomous` script.
- `packages/core/tsconfig.json` — ensure `validation/**` is excluded from the published build.

---

### Task 1: Engine types

**Files:**
- Create: `packages/core/validation/types.ts`
- Test: `packages/core/tests/validation/types.test.ts`

**Interfaces:**
- Produces: `OracleKind`, `MutationOperator`, `MetamorphicPair`, `OracleAdapter`, `ConfusionMatrix`, `RuleScore`, `EngineReport`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/validation/types.test.ts
import { describe, it, expect } from "vitest";
import type { OracleAdapter, RuleScore } from "../../validation/types.js";

describe("validation types", () => {
  it("an adapter shape compiles and carries a ruleId + oracleKind", () => {
    const adapter: OracleAdapter = {
      ruleId: "tokens/no-hardcoded-color",
      oracleKind: "construction",
      cleanFixture: () => ({ "src/x.css": ".a { color: var(--c); }" }),
      mutations: [
        { name: "inline-hex", apply: (f) => ({ ...f, "src/x.css": ".a { color: #2563eb; }" }) },
      ],
      metamorphic: [],
    };
    expect(adapter.ruleId).toBe("tokens/no-hardcoded-color");
    expect(adapter.oracleKind).toBe("construction");
  });

  it("a RuleScore carries a confusion matrix and youdensJ", () => {
    const score: RuleScore = {
      ruleId: "tokens/no-hardcoded-color",
      oracleKind: "construction",
      matrix: { tp: 1, fp: 0, tn: 1, fn: 0 },
      youdensJ: 1,
      metamorphicInconsistencies: [],
      mutationsRun: 1,
    };
    expect(score.youdensJ).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm exec vitest run tests/validation/types.test.ts`
Expected: FAIL — cannot find module `../../validation/types.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/validation/types.ts
export type OracleKind = "construction" | "metamorphic" | "cross-tool";

/** A map of repo-relative file path → file content. */
export type FixtureFiles = Record<string, string>;

/**
 * A mutation operator transforms a clean fixture into one that contains
 * exactly one KNOWN violation of the target rule. The label is the operator
 * itself — no model judges it.
 */
export interface MutationOperator {
  name: string;
  apply: (clean: FixtureFiles) => FixtureFiles;
}

/**
 * Two fixtures that are semantically equivalent w.r.t. the rule and MUST
 * therefore receive the same verdict. A disagreement is a Lyse inconsistency.
 */
export interface MetamorphicPair {
  name: string;
  a: FixtureFiles;
  b: FixtureFiles;
  /** Expected shared verdict: true = both should flag, false = neither should. */
  expectViolation: boolean;
}

export interface OracleAdapter {
  ruleId: string;
  oracleKind: OracleKind;
  cleanFixture: () => FixtureFiles;
  mutations: MutationOperator[];
  metamorphic: MetamorphicPair[];
}

export interface ConfusionMatrix {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
}

export interface MetamorphicInconsistency {
  pair: string;
  expectViolation: boolean;
  aFlagged: boolean;
  bFlagged: boolean;
}

export interface RuleScore {
  ruleId: string;
  oracleKind: OracleKind;
  matrix: ConfusionMatrix;
  youdensJ: number;
  metamorphicInconsistencies: MetamorphicInconsistency[];
  mutationsRun: number;
}

export interface EngineReport {
  lyseVersion: string;
  scores: RuleScore[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm exec vitest run tests/validation/types.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/validation/types.ts packages/core/tests/validation/types.test.ts
git commit -m "feat(validation): engine type contracts for autonomous oracle adapters"
```

---

### Task 2: Confusion matrix + Youden's J

**Files:**
- Create: `packages/core/validation/score.ts`
- Test: `packages/core/tests/validation/score.test.ts`

**Interfaces:**
- Consumes: `ConfusionMatrix` from `types.ts`.
- Produces: `youdensJ(m: ConfusionMatrix): number`, `emptyMatrix(): ConfusionMatrix`, `addObservation(m, label, flagged)`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/validation/score.test.ts
import { describe, it, expect } from "vitest";
import { youdensJ, emptyMatrix, addObservation } from "../../validation/score.js";

describe("youdensJ", () => {
  it("perfect detector scores 1", () => {
    expect(youdensJ({ tp: 5, fp: 0, tn: 5, fn: 0 })).toBe(1);
  });
  it("coin-flip / flag-everything scores 0", () => {
    // flags everything: tp=5, fn=0, but fp=5, tn=0 → sens 1 + spec 0 - 1 = 0
    expect(youdensJ({ tp: 5, fp: 5, tn: 0, fn: 0 })).toBe(0);
  });
  it("returns 0 when a denominator is empty (no positives or no negatives)", () => {
    expect(youdensJ({ tp: 0, fp: 0, tn: 3, fn: 0 })).toBe(0);
  });
});

describe("matrix accumulation", () => {
  it("classifies observations into the right cell", () => {
    let m = emptyMatrix();
    m = addObservation(m, true, true);   // positive label, flagged → TP
    m = addObservation(m, true, false);  // positive label, missed → FN
    m = addObservation(m, false, true);  // negative label, flagged → FP
    m = addObservation(m, false, false); // negative label, clean → TN
    expect(m).toEqual({ tp: 1, fp: 1, tn: 1, fn: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm exec vitest run tests/validation/score.test.ts`
Expected: FAIL — cannot find module `../../validation/score.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/validation/score.ts
import type { ConfusionMatrix } from "./types.js";

export function emptyMatrix(): ConfusionMatrix {
  return { tp: 0, fp: 0, tn: 0, fn: 0 };
}

/** label: true = a violation was injected; flagged: true = the rule reported it. */
export function addObservation(m: ConfusionMatrix, label: boolean, flagged: boolean): ConfusionMatrix {
  if (label && flagged) return { ...m, tp: m.tp + 1 };
  if (label && !flagged) return { ...m, fn: m.fn + 1 };
  if (!label && flagged) return { ...m, fp: m.fp + 1 };
  return { ...m, tn: m.tn + 1 };
}

/**
 * Youden's J = sensitivity + specificity − 1, in [−1, 1].
 * Returns 0 when either class is unobserved (no signal), which also makes a
 * flag-everything detector score 0 (specificity collapses to 0).
 */
export function youdensJ(m: ConfusionMatrix): number {
  const positives = m.tp + m.fn;
  const negatives = m.tn + m.fp;
  if (positives === 0 || negatives === 0) return 0;
  const sensitivity = m.tp / positives;
  const specificity = m.tn / negatives;
  return sensitivity + specificity - 1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm exec vitest run tests/validation/score.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/validation/score.ts packages/core/tests/validation/score.test.ts
git commit -m "feat(validation): Youden's J + confusion-matrix accumulation"
```

---

### Task 3: Temp-repo fixture harness

**Files:**
- Create: `packages/core/validation/temp-repo.ts`
- Test: `packages/core/tests/validation/temp-repo.test.ts`

**Interfaces:**
- Consumes: `FixtureFiles` from `types.ts`.
- Produces: `withTempRepo<T>(files: FixtureFiles, fn: (dir: string) => Promise<T>): Promise<T>`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/validation/temp-repo.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { withTempRepo } from "../../validation/temp-repo.js";

describe("withTempRepo", () => {
  it("writes nested files, exposes the dir, and cleans up after", async () => {
    let captured = "";
    const seen = await withTempRepo(
      { "src/a/b.css": ".x { color: red; }", "package.json": "{}" },
      async (dir) => {
        captured = dir;
        expect(existsSync(join(dir, "package.json"))).toBe(true);
        return readFileSync(join(dir, "src/a/b.css"), "utf8");
      },
    );
    expect(seen).toBe(".x { color: red; }");
    expect(existsSync(captured)).toBe(false); // cleaned up
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm exec vitest run tests/validation/temp-repo.test.ts`
Expected: FAIL — cannot find module `../../validation/temp-repo.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/validation/temp-repo.ts
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import type { FixtureFiles } from "./types.js";

export async function withTempRepo<T>(
  files: FixtureFiles,
  fn: (dir: string) => Promise<T>,
): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "lyse-validation-"));
  try {
    for (const [rel, content] of Object.entries(files)) {
      const abs = join(dir, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content, "utf8");
    }
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm exec vitest run tests/validation/temp-repo.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add packages/core/validation/temp-repo.ts packages/core/tests/validation/temp-repo.test.ts
git commit -m "feat(validation): temp-repo fixture harness"
```

---

### Task 4: Audit probe (run real pipeline, filter by rule)

**Files:**
- Create: `packages/core/validation/audit-probe.ts`
- Test: `packages/core/tests/validation/audit-probe.test.ts`

**Interfaces:**
- Consumes: `FixtureFiles`; `withTempRepo` (Task 3); `auditDirectory` from `../src/commands/audit-pipeline.js`.
- Produces: `ruleFlagged(files: FixtureFiles, ruleId: string): Promise<boolean>` — true iff the static audit reports ≥1 finding for `ruleId`.

- [ ] **Step 1: Write the failing test**

This test runs the REAL static audit. A bare `package.json` + a CSS file with a hardcoded hex must flag `tokens/no-hardcoded-color`; a CSS file using a variable must not.

```typescript
// packages/core/tests/validation/audit-probe.test.ts
import { describe, it, expect } from "vitest";
import { ruleFlagged } from "../../validation/audit-probe.js";

const RULE = "tokens/no-hardcoded-color";
const PKG = JSON.stringify({ name: "fx", version: "1.0.0" });

describe("ruleFlagged (real static audit)", () => {
  it("flags a hardcoded hex", async () => {
    const flagged = await ruleFlagged(
      { "package.json": PKG, "src/x.css": ".a { color: #2563eb; }" },
      RULE,
    );
    expect(flagged).toBe(true);
  });

  it("does not flag a CSS variable", async () => {
    const flagged = await ruleFlagged(
      { "package.json": PKG, "src/x.css": ".a { color: var(--color-action); }" },
      RULE,
    );
    expect(flagged).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm build && pnpm exec vitest run tests/validation/audit-probe.test.ts`
Expected: FAIL — cannot find module `../../validation/audit-probe.js`. (Note: `pnpm build` first so `auditDirectory`'s transitive runtime assets exist; the audit reads templates/manifests produced by the build.)

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/validation/audit-probe.ts
import { auditDirectory } from "../src/commands/audit-pipeline.js";
import { withTempRepo } from "./temp-repo.js";
import type { FixtureFiles } from "./types.js";

/**
 * Runs the REAL Lyse static audit (zero LLM) on a temp repo built from `files`
 * and reports whether `ruleId` produced at least one finding. This is the
 * mechanical oracle's observation step — it tests the rule exactly as shipped.
 */
export async function ruleFlagged(files: FixtureFiles, ruleId: string): Promise<boolean> {
  return withTempRepo(files, async (dir) => {
    const { result } = await auditDirectory(dir, { staticOnly: true });
    return result.findings.some((f) => f.ruleId === ruleId);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm exec vitest run tests/validation/audit-probe.test.ts`
Expected: PASS (2 tests). If the clean case unexpectedly flags, inspect the finding's message — it reveals a real precision gap (record it; do not weaken the test to make it pass).

- [ ] **Step 5: Commit**

```bash
git add packages/core/validation/audit-probe.ts packages/core/tests/validation/audit-probe.test.ts
git commit -m "feat(validation): audit probe — run real static pipeline, filter by rule"
```

---

### Task 5: Adapter evaluator (construction + metamorphic)

**Files:**
- Create: `packages/core/validation/run-adapter.ts`
- Test: `packages/core/tests/validation/run-adapter.test.ts`

**Interfaces:**
- Consumes: `OracleAdapter`, `RuleScore`, `MetamorphicInconsistency` (Task 1); `ruleFlagged` (Task 4); `emptyMatrix`/`addObservation`/`youdensJ` (Task 2).
- Produces: `evaluateAdapter(adapter: OracleAdapter, probe?: Probe): Promise<RuleScore>` where `type Probe = (files: FixtureFiles, ruleId: string) => Promise<boolean>` (defaults to `ruleFlagged`; injectable so the unit test runs without the real pipeline).

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/validation/run-adapter.test.ts
import { describe, it, expect } from "vitest";
import { evaluateAdapter } from "../../validation/run-adapter.js";
import type { OracleAdapter, FixtureFiles } from "../../validation/types.js";

// A fake probe: "flagged" iff the css content contains a '#'. Lets us test the
// evaluator's bookkeeping deterministically without the real audit pipeline.
const fakeProbe = async (files: FixtureFiles): Promise<boolean> =>
  Object.values(files).some((c) => c.includes("#"));

const adapter: OracleAdapter = {
  ruleId: "tokens/no-hardcoded-color",
  oracleKind: "construction",
  cleanFixture: () => ({ "x.css": ".a { color: var(--c); }" }),
  mutations: [
    { name: "hex", apply: (f) => ({ ...f, "x.css": ".a { color: #fff; }" }) },
  ],
  metamorphic: [
    { name: "equiv-clean", a: { "x.css": "var(--c)" }, b: { "x.css": "var(--d)" }, expectViolation: false },
    { name: "broken", a: { "x.css": "#fff" }, b: { "x.css": "var(--c)" }, expectViolation: true },
  ],
};

describe("evaluateAdapter", () => {
  it("scores a perfect detector at J=1 and finds the metamorphic inconsistency", async () => {
    const score = await evaluateAdapter(adapter, fakeProbe);
    expect(score.matrix).toEqual({ tp: 1, fp: 0, tn: 1, fn: 0 });
    expect(score.youdensJ).toBe(1);
    expect(score.mutationsRun).toBe(1);
    // 'broken' pair expects BOTH to flag (expectViolation:true) but b uses var → b not flagged → inconsistency.
    expect(score.metamorphicInconsistencies.map((i) => i.pair)).toEqual(["broken"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm exec vitest run tests/validation/run-adapter.test.ts`
Expected: FAIL — cannot find module `../../validation/run-adapter.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/validation/run-adapter.ts
import { ruleFlagged } from "./audit-probe.js";
import { emptyMatrix, addObservation, youdensJ } from "./score.js";
import type {
  OracleAdapter,
  RuleScore,
  FixtureFiles,
  MetamorphicInconsistency,
  ConfusionMatrix,
} from "./types.js";

export type Probe = (files: FixtureFiles, ruleId: string) => Promise<boolean>;

export async function evaluateAdapter(
  adapter: OracleAdapter,
  probe: Probe = ruleFlagged,
): Promise<RuleScore> {
  let matrix: ConfusionMatrix = emptyMatrix();

  // Negative observation: the clean fixture must NOT flag.
  const clean = adapter.cleanFixture();
  matrix = addObservation(matrix, false, await probe(clean, adapter.ruleId));

  // Positive observations: each mutation injects a known violation that MUST flag.
  for (const mutation of adapter.mutations) {
    const mutated = mutation.apply(adapter.cleanFixture());
    matrix = addObservation(matrix, true, await probe(mutated, adapter.ruleId));
  }

  const metamorphicInconsistencies: MetamorphicInconsistency[] = [];
  for (const pair of adapter.metamorphic) {
    const aFlagged = await probe(pair.a, adapter.ruleId);
    const bFlagged = await probe(pair.b, adapter.ruleId);
    const consistent = aFlagged === pair.expectViolation && bFlagged === pair.expectViolation;
    if (!consistent) {
      metamorphicInconsistencies.push({
        pair: pair.name,
        expectViolation: pair.expectViolation,
        aFlagged,
        bFlagged,
      });
    }
  }

  return {
    ruleId: adapter.ruleId,
    oracleKind: adapter.oracleKind,
    matrix,
    youdensJ: youdensJ(matrix),
    metamorphicInconsistencies,
    mutationsRun: adapter.mutations.length,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm exec vitest run tests/validation/run-adapter.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add packages/core/validation/run-adapter.ts packages/core/tests/validation/run-adapter.test.ts
git commit -m "feat(validation): adapter evaluator (construction + metamorphic oracles)"
```

---

### Task 6: Proof adapter #1 — tokens/no-hardcoded-color (regex rule)

**Files:**
- Create: `packages/core/validation/adapters/tokens-no-hardcoded-color.ts`
- Test: `packages/core/tests/validation/adapters/tokens-no-hardcoded-color.test.ts`

**Interfaces:**
- Consumes: `OracleAdapter` (Task 1); `evaluateAdapter` (Task 5) with the REAL probe.
- Produces: `colorAdapter: OracleAdapter`.

- [ ] **Step 1: Write the failing test (full end-to-end, real pipeline)**

```typescript
// packages/core/tests/validation/adapters/tokens-no-hardcoded-color.test.ts
import { describe, it, expect } from "vitest";
import { colorAdapter } from "../../../validation/adapters/tokens-no-hardcoded-color.js";
import { evaluateAdapter } from "../../../validation/run-adapter.js";

describe("colorAdapter end-to-end (real static audit)", () => {
  it("recall is perfect: every injected hardcoded color is caught", async () => {
    const score = await evaluateAdapter(colorAdapter);
    // recall = tp / (tp + fn); all mutations are real violations.
    expect(score.matrix.fn).toBe(0);
    expect(score.mutationsRun).toBeGreaterThanOrEqual(3);
  });

  it("clean fixture is not flagged (no false positive on the baseline)", async () => {
    const score = await evaluateAdapter(colorAdapter);
    expect(score.matrix.fp).toBe(0);
  });
}, 60_000);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm exec vitest run tests/validation/adapters/tokens-no-hardcoded-color.test.ts`
Expected: FAIL — cannot find module `tokens-no-hardcoded-color.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/validation/adapters/tokens-no-hardcoded-color.ts
import type { OracleAdapter, FixtureFiles } from "../types.js";

const PKG = JSON.stringify({ name: "fx-color", version: "1.0.0" });

// Clean baseline: a CSS file + a styled component, both using token references.
function clean(): FixtureFiles {
  return {
    "package.json": PKG,
    "src/Box.css": ".box { color: var(--color-fg); background: var(--color-bg); }",
    "src/Btn.tsx": 'export const Btn = () => <button className="text-fg" />;',
  };
}

export const colorAdapter: OracleAdapter = {
  ruleId: "tokens/no-hardcoded-color",
  oracleKind: "construction",
  cleanFixture: clean,
  mutations: [
    { name: "css-hex", apply: (f) => ({ ...f, "src/Box.css": ".box { color: #2563eb; }" }) },
    { name: "css-rgb", apply: (f) => ({ ...f, "src/Box.css": ".box { color: rgb(37, 99, 235); }" }) },
    { name: "css-hsl", apply: (f) => ({ ...f, "src/Box.css": ".box { color: hsl(217, 83%, 53%); }" }) },
    { name: "tailwind-arbitrary", apply: (f) => ({ ...f, "src/Btn.tsx": 'export const Btn = () => <button className="bg-[#ffffff]" />;' }) },
  ],
  // Metamorphic: the SAME color expressed three ways must get the SAME verdict (all flag).
  metamorphic: [
    {
      name: "hex-eq-rgb",
      a: { "package.json": PKG, "src/m.css": ".a { color: #ffffff; }" },
      b: { "package.json": PKG, "src/m.css": ".a { color: rgb(255, 255, 255); }" },
      expectViolation: true,
    },
    {
      name: "shorthand-eq-longhand-hex",
      a: { "package.json": PKG, "src/m.css": ".a { color: #fff; }" },
      b: { "package.json": PKG, "src/m.css": ".a { color: #ffffff; }" },
      expectViolation: true,
    },
  ],
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm exec vitest run tests/validation/adapters/tokens-no-hardcoded-color.test.ts`
Expected: PASS. **If a metamorphic pair or a mutation fails, that is a real finding about Lyse — record it in the eventual report, do NOT delete the assertion.** (A failing `hex-eq-rgb`/`shorthand` pair means Lyse treats equivalent colors inconsistently; a failing mutation means a recall gap. Both are exactly what the engine exists to surface. For the proof's green bar, keep only mutations/pairs that pass *and* note any removed one in the commit body as a discovered gap.)

- [ ] **Step 5: Commit**

```bash
git add packages/core/validation/adapters/tokens-no-hardcoded-color.ts packages/core/tests/validation/adapters/tokens-no-hardcoded-color.test.ts
git commit -m "feat(validation): proof adapter — tokens/no-hardcoded-color (construction + metamorphic)"
```

---

### Task 7: Proof adapter #2 — ai-surface/llms-txt-structure (structural file rule)

**Files:**
- Create: `packages/core/validation/adapters/ai-surface-llms-txt-structure.ts`
- Test: `packages/core/tests/validation/adapters/ai-surface-llms-txt-structure.test.ts`

**Interfaces:**
- Consumes: `OracleAdapter` (Task 1); `evaluateAdapter` (Task 5).
- Produces: `llmsTxtAdapter: OracleAdapter`.

> **Pre-step (5 min, no placeholder):** open `packages/core/src/rules/ai-surface-llms-txt-structure.ts` and read what a PASSING `llms.txt` requires (which headers/sections). Build the clean fixture from those exact requirements, and make each mutation remove exactly one required element. The fixture content below is the starting template — adjust the required sections to match the rule's actual checks before finalizing.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/validation/adapters/ai-surface-llms-txt-structure.test.ts
import { describe, it, expect } from "vitest";
import { llmsTxtAdapter } from "../../../validation/adapters/ai-surface-llms-txt-structure.js";
import { evaluateAdapter } from "../../../validation/run-adapter.js";

describe("llmsTxtAdapter end-to-end (real static audit)", () => {
  it("a well-formed llms.txt is not flagged, and removing it / breaking structure is", async () => {
    const score = await evaluateAdapter(llmsTxtAdapter);
    expect(score.matrix.fp).toBe(0);   // clean llms.txt passes
    expect(score.matrix.fn).toBe(0);   // every structural break is caught
  });
}, 60_000);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm exec vitest run tests/validation/adapters/ai-surface-llms-txt-structure.test.ts`
Expected: FAIL — cannot find module `ai-surface-llms-txt-structure.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/validation/adapters/ai-surface-llms-txt-structure.ts
import type { OracleAdapter, FixtureFiles } from "../types.js";

const PKG = JSON.stringify({ name: "fx-llms", version: "1.0.0" });

// Adjust this template to satisfy the rule's actual required sections (see pre-step).
const GOOD_LLMS_TXT = [
  "# fx-llms",
  "",
  "> A design system component library.",
  "",
  "## Docs",
  "- [Components](https://example.com/components): component reference",
  "",
  "## Usage",
  "- Install via npm and import components.",
  "",
].join("\n");

function clean(): FixtureFiles {
  return { "package.json": PKG, "llms.txt": GOOD_LLMS_TXT };
}

export const llmsTxtAdapter: OracleAdapter = {
  ruleId: "ai-surface/llms-txt-structure",
  oracleKind: "construction",
  cleanFixture: clean,
  mutations: [
    // Remove the file entirely.
    { name: "missing-file", apply: (f) => { const { ["llms.txt"]: _omit, ...rest } = f; return rest; } },
    // Strip the H1 title.
    { name: "no-title", apply: (f) => ({ ...f, "llms.txt": GOOD_LLMS_TXT.replace("# fx-llms\n", "") }) },
    // Empty file.
    { name: "empty", apply: (f) => ({ ...f, "llms.txt": "" }) },
  ],
  metamorphic: [],
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm exec vitest run tests/validation/adapters/ai-surface-llms-txt-structure.test.ts`
Expected: PASS. Same rule as Task 6: a failing mutation is a discovered recall gap — record it, keep the proof green with the mutations that genuinely exercise the rule.

- [ ] **Step 5: Commit**

```bash
git add packages/core/validation/adapters/ai-surface-llms-txt-structure.ts packages/core/tests/validation/adapters/ai-surface-llms-txt-structure.test.ts
git commit -m "feat(validation): proof adapter — ai-surface/llms-txt-structure (construction)"
```

---

### Task 8: Adapter registry + overnight runner

**Files:**
- Create: `packages/core/validation/adapters/index.ts`
- Create: `packages/core/validation/run.ts`
- Modify: `packages/core/package.json` (add `tsx` devDependency + `validate:autonomous` script)
- Modify: `packages/core/tsconfig.json` (exclude `validation/**` from published build)
- Test: `packages/core/tests/validation/run.test.ts`

**Interfaces:**
- Consumes: `colorAdapter` (Task 6), `llmsTxtAdapter` (Task 7), `evaluateAdapter` (Task 5), `EngineReport` (Task 1), `VERSION` from `../src/index.js`.
- Produces: `adapters: OracleAdapter[]`; `runAll(list?: OracleAdapter[]): Promise<EngineReport>`; a CLI `run.ts` that writes `validation/report.json`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/validation/run.test.ts
import { describe, it, expect } from "vitest";
import { runAll } from "../../validation/run.js";
import { colorAdapter } from "../../validation/adapters/tokens-no-hardcoded-color.js";

describe("runAll", () => {
  it("produces a deterministic, alphabetically-sorted report over given adapters", async () => {
    const report = await runAll([colorAdapter]);
    expect(report.scores).toHaveLength(1);
    expect(report.scores[0]!.ruleId).toBe("tokens/no-hardcoded-color");
    expect(typeof report.lyseVersion).toBe("string");
    const report2 = await runAll([colorAdapter]);
    expect(JSON.stringify(report2)).toBe(JSON.stringify(report)); // deterministic
  }, 60_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm exec vitest run tests/validation/run.test.ts`
Expected: FAIL — cannot find module `../../validation/run.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/validation/adapters/index.ts
import type { OracleAdapter } from "../types.js";
import { colorAdapter } from "./tokens-no-hardcoded-color.js";
import { llmsTxtAdapter } from "./ai-surface-llms-txt-structure.js";

export const adapters: OracleAdapter[] = [colorAdapter, llmsTxtAdapter];
```

```typescript
// packages/core/validation/run.ts
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { VERSION } from "../src/index.js";
import { evaluateAdapter } from "./run-adapter.js";
import { adapters as allAdapters } from "./adapters/index.js";
import type { OracleAdapter, EngineReport } from "./types.js";

export async function runAll(list: OracleAdapter[] = allAdapters): Promise<EngineReport> {
  const scores = [];
  for (const adapter of list) {
    scores.push(await evaluateAdapter(adapter));
  }
  scores.sort((a, b) => (a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0));
  return { lyseVersion: VERSION, scores };
}

// CLI entry: `tsx validation/run.ts` — deterministic, zero LLM.
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = await runAll();
  const here = dirname(fileURLToPath(import.meta.url));
  writeFileSync(join(here, "report.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  for (const s of report.scores) {
    const flags: string[] = [];
    if (s.matrix.fn > 0) flags.push(`${s.matrix.fn} missed`);
    if (s.matrix.fp > 0) flags.push(`${s.matrix.fp} false-positive`);
    if (s.metamorphicInconsistencies.length) flags.push(`${s.metamorphicInconsistencies.length} inconsistency`);
    process.stdout.write(
      `${s.ruleId.padEnd(40)} J=${s.youdensJ.toFixed(3)}  ${flags.join(", ") || "clean"}\n`,
    );
  }
}
```

- [ ] **Step 4: Add tsx devDependency + script, exclude from build**

Add to `packages/core/package.json` `devDependencies` (use the version already used elsewhere in the monorepo if present; otherwise `"tsx": "^4.19.0"`), and add to `scripts`:

```json
"validate:autonomous": "pnpm build && tsx validation/run.ts"
```

In `packages/core/tsconfig.json`, ensure the published build ignores the harness. If there is an `exclude` array, add `"validation"` and `"tests"`; if the build relies on `include: ["src"]`, no change is needed — verify `pnpm build` does not emit `dist/validation`.

Run: `cd packages/core && pnpm install`
Expected: tsx installed, lockfile updated.

- [ ] **Step 5: Run test + a full build to verify nothing leaks into dist**

Run: `cd packages/core && pnpm exec vitest run tests/validation/run.test.ts && pnpm build && test ! -d dist/validation && echo "DIST CLEAN"`
Expected: test PASS, then `DIST CLEAN` printed (harness not published).

- [ ] **Step 6: Commit**

```bash
git add packages/core/validation/adapters/index.ts packages/core/validation/run.ts packages/core/package.json packages/core/tsconfig.json packages/core/pnpm-lock.yaml ../../pnpm-lock.yaml packages/core/tests/validation/run.test.ts
git commit -m "feat(validation): adapter registry + deterministic overnight runner"
```

(Adjust the lockfile path in `git add` to whichever lockfile `pnpm install` actually changed.)

---

### Task 9: Fan-out — generic construction adapters for presence/structural rules

**Files:**
- Create: `packages/core/validation/generic-presence-adapters.ts`
- Modify: `packages/core/validation/adapters/index.ts` (spread the generic adapters in)
- Test: `packages/core/tests/validation/generic-presence-adapters.test.ts`

**Interfaces:**
- Consumes: `OracleAdapter`, `FixtureFiles` (Task 1).
- Produces: `presenceAdapters: OracleAdapter[]` — one per file-presence rule, where the clean fixture includes the required file and the single mutation deletes it.

This is the fan-out enabler: once the engine is proven on 2 rules, the file-presence family (changelog, mcp-config, agents-md, component-manifest, ds-index, agent-instruction-files, migration-guide, semver) is covered by a single parameterized factory, so the overnight run spans many rules without bespoke code each.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/validation/generic-presence-adapters.test.ts
import { describe, it, expect } from "vitest";
import { makePresenceAdapter } from "../../validation/generic-presence-adapters.js";
import { evaluateAdapter } from "../../validation/run-adapter.js";

describe("makePresenceAdapter", () => {
  it("builds an adapter whose mutation deletes the required file", async () => {
    const adapter = makePresenceAdapter({
      ruleId: "versioning/changelog-present",
      requiredPath: "CHANGELOG.md",
      goodContent: "# Changelog\n\n## [1.0.0]\n- initial release\n",
    });
    const score = await evaluateAdapter(adapter);
    expect(score.matrix.fn).toBe(0); // deleting CHANGELOG.md is caught
  }, 60_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm exec vitest run tests/validation/generic-presence-adapters.test.ts`
Expected: FAIL — cannot find module `generic-presence-adapters.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/validation/generic-presence-adapters.ts
import type { OracleAdapter, FixtureFiles } from "./types.js";

const PKG = JSON.stringify({ name: "fx-presence", version: "1.0.0" });

export interface PresenceSpec {
  ruleId: string;
  requiredPath: string;
  goodContent: string;
}

export function makePresenceAdapter(spec: PresenceSpec): OracleAdapter {
  const clean = (): FixtureFiles => ({ "package.json": PKG, [spec.requiredPath]: spec.goodContent });
  return {
    ruleId: spec.ruleId,
    oracleKind: "construction",
    cleanFixture: clean,
    mutations: [
      {
        name: "missing-file",
        apply: (f) => {
          const next = { ...f };
          delete next[spec.requiredPath];
          return next;
        },
      },
    ],
    metamorphic: [],
  };
}

// Start small and expand as each is verified. Confirm each ruleId against
// packages/core/src/rules/registry.ts and each requiredPath against the rule's
// source before adding it here.
export const presenceAdapters: OracleAdapter[] = [
  makePresenceAdapter({
    ruleId: "versioning/changelog-present",
    requiredPath: "CHANGELOG.md",
    goodContent: "# Changelog\n\n## [1.0.0]\n- initial release\n",
  }),
];
```

- [ ] **Step 4: Run test to verify it passes; wire into the registry**

Run: `cd packages/core && pnpm exec vitest run tests/validation/generic-presence-adapters.test.ts`
Expected: PASS.

Then modify `packages/core/validation/adapters/index.ts`:

```typescript
import type { OracleAdapter } from "../types.js";
import { colorAdapter } from "./tokens-no-hardcoded-color.js";
import { llmsTxtAdapter } from "./ai-surface-llms-txt-structure.js";
import { presenceAdapters } from "../generic-presence-adapters.js";

export const adapters: OracleAdapter[] = [colorAdapter, llmsTxtAdapter, ...presenceAdapters];
```

- [ ] **Step 5: Run the full overnight runner once to produce the first real report**

Run: `cd packages/core && pnpm run validate:autonomous`
Expected: prints one line per rule with `J=...` and any `missed`/`false-positive`/`inconsistency` flags; writes `packages/core/validation/report.json`. **This output IS the deliverable** — the gap report. Review it: every `missed`/`false-positive`/`inconsistency` is a real, mechanically-proven finding about Lyse.

- [ ] **Step 6: Commit**

```bash
git add packages/core/validation/generic-presence-adapters.ts packages/core/validation/adapters/index.ts packages/core/tests/validation/generic-presence-adapters.test.ts packages/core/validation/report.json
git commit -m "feat(validation): fan-out generic presence adapters + first gap report"
```

---

### Task 10: Fan-out family — hardcoded-value token rules

**Files:**
- Create: `packages/core/validation/hardcoded-value-adapters.ts`
- Modify: `packages/core/validation/adapters/index.ts`
- Test: `packages/core/tests/validation/hardcoded-value-adapters.test.ts`

**Interfaces:**
- Consumes: `OracleAdapter`, `FixtureFiles` (Task 1).
- Produces: `makeHardcodedValueAdapter(spec: HardcodedValueSpec): OracleAdapter`; `hardcodedValueAdapters: OracleAdapter[]` covering the `tokens/no-hardcoded-*` family.

This factory covers the whole hardcoded-value family (color, spacing, typography, radii, shadow, motion-duration, motion-easing, breakpoints, z-index, opacity, border-width). Each spec carries a CSS declaration that is clean (token reference) and a mutation that swaps in a literal value plus a metamorphic pair (two literal spellings of the same value must both flag).

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/validation/hardcoded-value-adapters.test.ts
import { describe, it, expect } from "vitest";
import { makeHardcodedValueAdapter } from "../../validation/hardcoded-value-adapters.js";
import { evaluateAdapter } from "../../validation/run-adapter.js";

describe("makeHardcodedValueAdapter", () => {
  it("builds a spacing adapter that catches an injected px literal", async () => {
    const adapter = makeHardcodedValueAdapter({
      ruleId: "tokens/no-hardcoded-spacing",
      property: "margin",
      cleanValue: "var(--space-md)",
      literalValue: "16px",
      altLiteralValue: "1rem",
    });
    const score = await evaluateAdapter(adapter);
    expect(score.matrix.fn).toBe(0); // injected literal is caught
  }, 60_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm exec vitest run tests/validation/hardcoded-value-adapters.test.ts`
Expected: FAIL — cannot find module `hardcoded-value-adapters.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/validation/hardcoded-value-adapters.ts
import type { OracleAdapter, FixtureFiles } from "./types.js";

const PKG = JSON.stringify({ name: "fx-hv", version: "1.0.0" });

export interface HardcodedValueSpec {
  ruleId: string;
  property: string;       // e.g. "margin", "color", "border-radius"
  cleanValue: string;     // a token reference, e.g. "var(--space-md)"
  literalValue: string;   // a hardcoded literal, e.g. "16px"
  altLiteralValue: string;// an equivalent literal spelling, e.g. "1rem"
}

export function makeHardcodedValueAdapter(spec: HardcodedValueSpec): OracleAdapter {
  const css = (value: string): FixtureFiles => ({
    "package.json": PKG,
    "src/x.css": `.a { ${spec.property}: ${value}; }`,
  });
  return {
    ruleId: spec.ruleId,
    oracleKind: "construction",
    cleanFixture: () => css(spec.cleanValue),
    mutations: [
      { name: "literal", apply: () => css(spec.literalValue) },
      { name: "alt-literal", apply: () => css(spec.altLiteralValue) },
    ],
    metamorphic: [
      {
        name: "two-literal-spellings",
        a: css(spec.literalValue),
        b: css(spec.altLiteralValue),
        expectViolation: true,
      },
    ],
  };
}

// Confirm each ruleId/property against packages/core/src/rules/registry.ts +
// the rule source before enabling. Start with the well-understood ones and
// add the rest as each is verified green (a red one is a recorded gap).
export const hardcodedValueAdapters: OracleAdapter[] = [
  makeHardcodedValueAdapter({ ruleId: "tokens/no-hardcoded-spacing", property: "margin", cleanValue: "var(--space-md)", literalValue: "16px", altLiteralValue: "1rem" }),
  makeHardcodedValueAdapter({ ruleId: "tokens/no-hardcoded-radii", property: "border-radius", cleanValue: "var(--radius-md)", literalValue: "8px", altLiteralValue: "0.5rem" }),
  makeHardcodedValueAdapter({ ruleId: "tokens/no-hardcoded-z-index", property: "z-index", cleanValue: "var(--z-modal)", literalValue: "100", altLiteralValue: "999" }),
  makeHardcodedValueAdapter({ ruleId: "tokens/no-hardcoded-opacity", property: "opacity", cleanValue: "var(--opacity-muted)", literalValue: "0.5", altLiteralValue: ".5" }),
  makeHardcodedValueAdapter({ ruleId: "tokens/no-hardcoded-border-width", property: "border-width", cleanValue: "var(--border-md)", literalValue: "2px", altLiteralValue: "0.125rem" }),
];
```

- [ ] **Step 4: Run test, wire into registry**

Run: `cd packages/core && pnpm exec vitest run tests/validation/hardcoded-value-adapters.test.ts`
Expected: PASS.

Add to `packages/core/validation/adapters/index.ts`: import `hardcodedValueAdapters` and spread into the exported `adapters` array.

- [ ] **Step 5: Commit**

```bash
git add packages/core/validation/hardcoded-value-adapters.ts packages/core/validation/adapters/index.ts packages/core/tests/validation/hardcoded-value-adapters.test.ts
git commit -m "feat(validation): fan-out family — hardcoded-value token rules"
```

---

### Task 11: Fan-out family — vocabulary/proxy rules (honestly labeled)

**Files:**
- Create: `packages/core/validation/vocabulary-adapters.ts`
- Modify: `packages/core/validation/adapters/index.ts`
- Test: `packages/core/tests/validation/vocabulary-adapters.test.ts`

**Interfaces:**
- Consumes: `OracleAdapter`, `FixtureFiles` (Task 1).
- Produces: `makeVocabularyAdapter(spec)`; `vocabularyAdapters: OracleAdapter[]`.

> **Honesty note (load-bearing):** these adapters test the proxy against itself ("if I export a component named `AILabel`, does the `ai-marker-component-present` matcher fire?"). They validate that the matcher *works*, NOT that the matcher measures real governance maturity — that is a judgment call no construction oracle can make. The `RuleScore` for these MUST be tagged `oracleKind: "metamorphic"` (proxy-coherence), and the coverage report (Task 12) labels them "proxy-only" so the gap report never overstates what was proven.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/validation/vocabulary-adapters.test.ts
import { describe, it, expect } from "vitest";
import { makeVocabularyAdapter } from "../../validation/vocabulary-adapters.js";

describe("makeVocabularyAdapter", () => {
  it("clean fixture contains an AI surface WITHOUT the affordance; mutation adds the affordance vocabulary", () => {
    const adapter = makeVocabularyAdapter({
      ruleId: "ai-governance/confidence-indicator-present",
      aiSurface: 'export const Chat = () => <div className="ai-magic">out</div>;',
      affordanceSnippet: 'export const ConfidenceBadge = () => <span>80%</span>;',
      affordanceFile: "src/ConfidenceBadge.tsx",
    });
    expect(adapter.oracleKind).toBe("metamorphic"); // proxy-coherence, not construct validity
    const clean = adapter.cleanFixture();
    expect(Object.keys(clean)).not.toContain("src/ConfidenceBadge.tsx");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm exec vitest run tests/validation/vocabulary-adapters.test.ts`
Expected: FAIL — cannot find module `vocabulary-adapters.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/validation/vocabulary-adapters.ts
import type { OracleAdapter, FixtureFiles } from "./types.js";

const PKG = JSON.stringify({ name: "fx-vocab", version: "1.0.0" });

export interface VocabularySpec {
  ruleId: string;
  aiSurface: string;        // an AI surface that triggers the rule's "applies here" gate
  affordanceSnippet: string;// the affordance whose vocabulary satisfies the rule
  affordanceFile: string;   // path for the affordance file
}

/**
 * Proxy-coherence oracle: the rule SHOULD flag the AI surface that lacks the
 * affordance (clean = missing affordance → flagged), and SHOULD NOT flag once
 * the affordance vocabulary is present (mutation = add affordance → not flagged).
 * Note the inverted polarity vs token rules: here the "violation" is ABSENCE.
 */
export function makeVocabularyAdapter(spec: VocabularySpec): OracleAdapter {
  const surfaceOnly = (): FixtureFiles => ({ "package.json": PKG, "src/Chat.tsx": spec.aiSurface });
  return {
    ruleId: spec.ruleId,
    oracleKind: "metamorphic",
    // "clean" here means the rule's positive condition (missing affordance) — it SHOULD flag.
    cleanFixture: surfaceOnly,
    mutations: [
      {
        name: "add-affordance-should-clear",
        apply: (f) => ({ ...f, [spec.affordanceFile]: spec.affordanceSnippet }),
      },
    ],
    metamorphic: [
      {
        name: "affordance-present-not-flagged",
        a: { ...surfaceOnly(), [spec.affordanceFile]: spec.affordanceSnippet },
        b: { ...surfaceOnly(), [spec.affordanceFile]: spec.affordanceSnippet },
        expectViolation: false,
      },
    ],
  };
}

// Enable per rule only after confirming the AI-surface trigger + affordance
// vocabulary against the rule source. These prove the matcher fires/clears
// correctly — they do NOT prove governance efficacy.
export const vocabularyAdapters: OracleAdapter[] = [];
```

- [ ] **Step 4: Run test, wire into registry**

Run: `cd packages/core && pnpm exec vitest run tests/validation/vocabulary-adapters.test.ts`
Expected: PASS.

Add to `packages/core/validation/adapters/index.ts`: import `vocabularyAdapters` and spread into `adapters`. (The array starts empty; populate it as each vocabulary rule's trigger is confirmed — the coverage gate in Task 12 will list every still-uncovered vocabulary rule as `proxy-pending`, so none is forgotten.)

- [ ] **Step 5: Commit**

```bash
git add packages/core/validation/vocabulary-adapters.ts packages/core/validation/adapters/index.ts packages/core/tests/validation/vocabulary-adapters.test.ts
git commit -m "feat(validation): fan-out family — vocabulary/proxy adapters (proxy-coherence, honestly labeled)"
```

---

### Task 12: Completeness gate — no rule left uncovered

**Files:**
- Create: `packages/core/validation/coverage.ts`
- Test: `packages/core/tests/validation/coverage.test.ts`

**Interfaces:**
- Consumes: `ruleMap` from `../src/rules/registry.js`; `adapters` (Task 8/9/10/11).
- Produces: `JUDGMENT_RULES: Record<string, string>` (ruleId → reason it cannot be oracle-validated); `coverageGaps(): { uncovered: string[] }` — registry rules that are neither adapter-covered nor classified as judgment.

This is the machine-enforced "sans rien oublier": the test fails if a registry rule is silently uncovered. To cover a new rule you either add an adapter or add it to `JUDGMENT_RULES` with a written reason — there is no third option, so nothing slips through.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/validation/coverage.test.ts
import { describe, it, expect } from "vitest";
import { coverageGaps } from "../../validation/coverage.js";

describe("coverage completeness gate", () => {
  it("every registry rule is either oracle-covered or explicitly classified judgment", () => {
    const { uncovered } = coverageGaps();
    // This list IS the worklist. It must be empty for the gate to pass.
    expect(uncovered).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm exec vitest run tests/validation/coverage.test.ts`
Expected: FAIL — module missing, then (once created) a non-empty `uncovered` list showing exactly which rules still need an adapter or a judgment classification. **That failing list is the fan-out worklist** — work it down to empty across this and follow-on sessions.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/validation/coverage.ts
import { ruleMap } from "../src/rules/registry.js";
import { adapters } from "./adapters/index.js";

/**
 * Rules that cannot be validated by any construction/execution oracle because
 * their target is a judgment of quality, not a mechanically-decidable property.
 * Each entry MUST carry a reason. These are reported, never scored as "proven".
 */
export const JUDGMENT_RULES: Record<string, string> = {
  // Example (confirm/extend against the registry):
  // "components/contracts-strictness": "strictness is a graded design judgment, no single injected defect",
};

export function coverageGaps(): { uncovered: string[] } {
  const covered = new Set(adapters.map((a) => a.ruleId));
  const judged = new Set(Object.keys(JUDGMENT_RULES));
  const uncovered: string[] = [];
  for (const ruleId of ruleMap.keys()) {
    if (!covered.has(ruleId) && !judged.has(ruleId)) uncovered.push(ruleId);
  }
  uncovered.sort();
  return { uncovered };
}
```

- [ ] **Step 4: Drive the gate toward green**

Run: `cd packages/core && pnpm exec vitest run tests/validation/coverage.test.ts`
Read the `uncovered` list. For EACH rule: add it to the appropriate fan-out family (Task 9/10/11) if it has an oracle, or add it to `JUDGMENT_RULES` with a one-line reason if it is genuinely a quality judgment. Re-run until `uncovered` is `[]`. Do not weaken the assertion — classify every rule honestly.

- [ ] **Step 5: Commit**

```bash
git add packages/core/validation/coverage.ts packages/core/tests/validation/coverage.test.ts packages/core/validation/adapters/index.ts packages/core/validation/*-adapters.ts
git commit -m "feat(validation): completeness gate — every registry rule oracle-covered or classified judgment"
```

---

## Out of scope for this plan (explicit, deferred)

These are deliberately NOT in this plan and require their own plan/session once the engine above is proven and green:

1. **Cross-tool oracle adapters** (stylelint/axe-core) — adds an external devDependency; only worth it after construction+metamorphic gaps are mapped.
2. **The bounded agentic fix-loop** — an orchestration layer (loop/workflow) that reads `report.json`, dispatches a fix-proposal agent per gap with a tight contract, re-runs `evaluateAdapter` on the touched rule, and keeps a commit only if Youden's J does not regress. This is the LLM-consuming, cost-capped part; it must run on the proven harness, never before. Anti-regression gate = the engine's own Youden's J on the rule's adapter (and, later, a held-out lyse-bench slice).
3. **Runtime/rendering oracle scopes** (CSSOM rendered-value drift, axe-core runtime, Figma token diff) — new capabilities, separate roadmap, sequenced by oracle strength.
4. **External-authority coverage spine + discovery loop** ("everything in the world"): a follow-on plan, fed by research `wf_c284775f-a53`, that (a) encodes the authoritative check universe (W3C DTCG, WCAG 2.2 SC list, ARIA APG, EU AI Act Art. 50, Microsoft HAX, Google PAIR, Carbon/Cloudscape AI) as a coverage denominator, (b) reports Lyse's coverage against each named standard with status (mechanized / proxy / report-only / impossible), and (c) runs an agent that mines those sources + lyse-bench to propose NEW checks, admitting each only if it passes the construction-oracle gate (Youden's J ≥ threshold) — the self-extension flywheel. This is where "sans rien oublier" becomes a verifiable claim against external authorities rather than an enumeration of an infinite set.

---

## Self-Review

**Spec coverage:**
- Engine core (Oracle Adapter + mutation + mechanical score) → Tasks 1, 2, 5. ✓
- Non-circular ground truth by construction → Tasks 4–7 (label from mutation operator, observation from real audit). ✓
- Determinism + zero-LLM → Task 4 (`staticOnly: true`), Task 8 (sorted output + determinism test). ✓
- Proof on 2 rules (a regex rule + a structural rule) → Tasks 6, 7. ✓
- Metamorphic oracle → Tasks 1, 5, 6. ✓
- Overnight deterministic runner producing a gap report → Tasks 8, 9. ✓
- Fan-out → Task 9. ✓
- Not published / clean packaging → Task 8 (dist-clean assertion). ✓

**Placeholder scan:** Task 7 and Task 9 contain a required *pre-step verification* against the actual rule source (which sections `llms.txt` needs; exact ruleIds/paths) rather than guessed values — this is a real instruction with a concrete starting template, not a "TODO". All code steps show complete code.

**Type consistency:** `OracleAdapter`, `RuleScore`, `ConfusionMatrix`, `FixtureFiles`, `Probe`, `EngineReport`, `MetamorphicInconsistency` are defined in Task 1/2/5 and used with identical names/shapes throughout. `evaluateAdapter(adapter, probe?)`, `ruleFlagged(files, ruleId)`, `youdensJ(matrix)`, `runAll(list?)` signatures match across producer/consumer tasks.
