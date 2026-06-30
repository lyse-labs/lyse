# color — AST confidence grading — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grade each `tokens/no-hardcoded-color` finding's confidence from its AST role (authored-styling drift = high; functional roles canvas `fillStyle`/default-prop/SVG-art = low), measure precision on the high-confidence subset, and — only if it clears ≥0.90 — promote color into the score via a v2→v3 bump.

**Architecture:** Extend the color rule's existing `classifyConfidence` hook with an AST role analyzer (ts-morph, lazily loaded per finding, degrade-to-high on any failure). The critical path is Task 1 (AST role grading) + Task 2 (measure high-confidence precision) — that answers "can confidence-grading reach 90%?". Tasks 3-5 (score-on-high-confidence, hide-low-in-default-report, vendor+promote) are CONDITIONAL on Task 2 clearing the gate.

**Tech Stack:** TypeScript (strict), vitest, ts-morph (`src/parsers/ts-morph-project.ts`), the existing `classifyConfidence` contract + `codemods/safety.ts` dispatcher, the faithful harvest harness, sub-project A's `deriveMeasurement` + coherence test.

## Global Constraints

- Strict TS (exactOptionalPropertyTypes, noUncheckedIndexedAccess, verbatimModuleSyntax); ESM `.js`.
- Determinism byte-for-byte; no Date.now()/Math.random(); `lastCalibrated` fixed string.
- **Integrity guardrail (non-negotiable):** low confidence is reserved for genuine functional/non-drift AST roles, each justified by a concrete AST signal — never "an FP we couldn't fix." High-confidence recall is measured and must stay high (real drift must NOT be demoted to low to fake precision).
- Degrade gracefully: a literal whose AST role can't be determined stays **high** confidence (favor recall over precision in grading). CSS findings (no JS AST) stay high.
- No LLM in the score; confidence grading is deterministic AST analysis.
- Score changes ONLY if the gate (high-confidence precision ≥0.90 ∧ recall ≥0.90 ∧ N≥30) is cleared, via `CURRENT_SCORING_VERSION` bump + new `LOCKED` entry.
- Conventional Commits; branch `feat/color-to-90`. Trailers: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_01MoiMorjpU4r6NaYfctP96w`. English.

## File Structure

- `packages/core/src/rules/_color-ast-role.ts` — **new.** Pure AST role analyzer: given a file's ts-morph source + a position, classify the color literal's role.
- `packages/core/src/rules/tokens-no-hardcoded-color.ts` — **modify.** `classifyConfidence` consults the role analyzer.
- `packages/core/src/reporters/terminal.ts` — **modify (Task 4, conditional).** Hide low-confidence color findings in default mode.
- `packages/core/src/scorer.ts` — **modify (Task 3+5, conditional).** Count only high-confidence color findings; v2→v3 bump.
- `packages/core/src/reliability/catalogue/sub-axes.ts`, `tests/scoring-contract.test.ts` — **modify (Task 5, conditional).**
- `packages/core/fixtures/reliability/color/` — **modify (Task 5).** High/low-confidence labelled fixtures.

---

## Task 1: AST role analyzer + wire into `classifyConfidence`

**Files:**
- Create: `packages/core/src/rules/_color-ast-role.ts`
- Modify: `packages/core/src/rules/tokens-no-hardcoded-color.ts` (`classifyConfidence`, ~line 520)
- Test: `packages/core/tests/rules/color-ast-role.test.ts`

**Interfaces:**
- Consumes: `ClassifyContext` (`{ tokens, components, config, repoRoot? }` from `src/types.ts:453`), the shared ts-morph project (`getTsMorphProject` from `src/parsers/ts-morph-project.ts`).
- Produces: `classifyColorRole(args: { repoRoot: string; file: string; line: number; column: number }): "canvas" | "default-prop" | "svg-art" | "styling" | "unknown"`. The color rule's `classifyConfidence` maps `canvas`/`default-prop`/`svg-art` → `"low"`; everything else keeps the existing logic (alpha→medium, token-def→medium, else high).

- [ ] **Step 1: Write the failing test for the role analyzer**

```typescript
// packages/core/tests/rules/color-ast-role.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { classifyColorRole } from "../../src/rules/_color-ast-role.js";

let dir: string;
function write(rel: string, src: string): { file: string; line: number; column: number } {
  const abs = join(dir, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, src);
  const idx = src.indexOf("#");
  const before = src.slice(0, idx);
  const line = before.split("\n").length;
  const column = idx - before.lastIndexOf("\n");
  return { file: rel, line, column };
}

describe("classifyColorRole", () => {
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "role-")); });

  it("classifies canvas fillStyle assignment as canvas", () => {
    const loc = write("a.ts", "function draw(c: CanvasRenderingContext2D){ c.fillStyle = '#ffffff'; }");
    expect(classifyColorRole({ repoRoot: dir, ...loc })).toBe("canvas");
  });

  it("classifies a default prop value as default-prop", () => {
    const loc = write("b.tsx", "export const Icon = ({ color = '#2563eb' }: { color?: string }) => <svg/>;");
    expect(classifyColorRole({ repoRoot: dir, ...loc })).toBe("default-prop");
  });

  it("classifies fill on an SVG element as svg-art", () => {
    const loc = write("c.tsx", "export const I = () => <svg><path fill='#2563eb' /></svg>;");
    expect(classifyColorRole({ repoRoot: dir, ...loc })).toBe("svg-art");
  });

  it("classifies a styled component color property as styling (drift)", () => {
    const loc = write("d.tsx", "const Box = styled.div({ color: '#2563eb' });");
    expect(classifyColorRole({ repoRoot: dir, ...loc })).toBe("styling");
  });

  it("returns unknown when the position has no resolvable node", () => {
    const loc = { file: "missing.ts", line: 1, column: 1 };
    expect(classifyColorRole({ repoRoot: dir, ...loc })).toBe("unknown");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm vitest run tests/rules/color-ast-role.test.ts`
Expected: FAIL — `Cannot find module '.../_color-ast-role.js'`.

- [ ] **Step 3: Implement the role analyzer**

Create `_color-ast-role.ts`. Use the shared ts-morph project (`getTsMorphProject(repoRoot)`); get the source file for `file`; convert (line,column) to a position; find the node at that position (`sourceFile.getDescendantAtPos(pos)`); walk ancestors (bounded, e.g. ≤6 levels) to detect, in priority order:
1. **canvas:** the literal is the RHS of an assignment whose LHS is a property access ending in `fillStyle` / `strokeStyle` / `shadowColor` → `"canvas"`.
2. **default-prop:** the literal is the default in a parameter / binding-element default or an object property under a `defaultProps` → and the bound name is color-ish (`color`/`fill`/`stroke`/`background`/`bg`/`tint`/`shadow`) → `"default-prop"`.
3. **svg-art:** the literal is the value of a JSX attribute named `fill`/`stroke` on a JSX element whose tag is a lowercase SVG element (`path`/`svg`/`circle`/`rect`/`g`/`polygon`/`line`/`ellipse`/`polyline`) → `"svg-art"`.
4. otherwise → `"styling"`.
Wrap everything in try/catch; on any failure (file not found, parse error, position not resolvable) return `"unknown"`. Pure, deterministic, no Date.now/Math.random.

(The exact ts-morph calls are the implementer's to wire; the contract is the 5 return values and the 5 test cases above. Keep the ancestor walk bounded and the SVG tag list explicit.)

- [ ] **Step 4: Run the role test to green**

Run: `cd packages/core && pnpm vitest run tests/rules/color-ast-role.test.ts`
Expected: PASS (all 5).

- [ ] **Step 5: Wire into `classifyConfidence` (test-first)**

Add a test to the existing color confidence coverage asserting the demotion:

```typescript
// in packages/core/tests/rules/ (extend color confidence tests or a new file)
// A canvas fillStyle color finding is graded "low"; a styled color finding stays "high".
```

Then in `tokens-no-hardcoded-color.ts` `classifyConfidence`, BEFORE the existing token-lookup logic, add: if `ctx.repoRoot` is set, call `classifyColorRole({ repoRoot: ctx.repoRoot, file: finding.location.file, line: finding.location.line, column: finding.location.column ?? 1 })`; if the role is `canvas`/`default-prop`/`svg-art`, return `"low"`. Otherwise fall through to the existing logic (alpha→medium, token-def→medium, else high). Degrade: if repoRoot absent or role `unknown`/`styling`, keep existing behavior (never demote on unknown).

- [ ] **Step 6: Green + full suite + gate**

Run: `cd packages/core && pnpm vitest run tests/rules/color-ast-role.test.ts <the wiring test>` → PASS.
Run: `cd packages/core && pnpm vitest run` → green (existing color tests unaffected — none of their fixtures are canvas/default-prop/svg-art, so confidence is unchanged for them). Run `pnpm validate:autonomous` → ENGINE GATE PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/rules/_color-ast-role.ts packages/core/src/rules/tokens-no-hardcoded-color.ts packages/core/tests/rules/color-ast-role.test.ts <wiring test>
git commit -m "feat(tokens): grade color confidence by AST role (canvas/default-prop/svg-art -> low)"
```

---

## Task 2: Measure high-confidence precision (CRITICAL PATH — decides promotion)

**Files:**
- Modify: `scripts/harvest-color-findings.ts` (emit `confidence` per finding)
- Create: `.superpowers/sdd/color-confidence-measure-report.md` (scratch)

**Interfaces:**
- Consumes: the faithful harness (`collectColorFindings`), the labelled harvest dataset (`docs/superpowers/color-harvest-labels.md` + the app labels), `classifyColorRole` (Task 1).
- Produces: a measurement of precision on **high-confidence** findings only + the high-confidence **recall** (the integrity check).

- [ ] **Step 1: Add `confidence` to the harvest harness output**

In `scripts/harvest-color-findings.ts`, after collecting each color finding from `auditDirectory`, the finding already carries `confidence` (set by the safety dispatcher in the pipeline). Add `confidence: f.confidence ?? "high"` to the emitted `HarvestRow`. (Verify the audit pipeline runs the safety dispatcher so findings carry confidence; if not, call `classifyColorRole` directly in the harness with the same inputs.) Update the `HarvestRow` type + the existing harness test to assert the field is present.

- [ ] **Step 2: Run the harness over the cloned repos**

Run: `pnpm tsx scripts/harvest-color-findings.ts .color-harvest .color-harvest/findings-conf.jsonl`
Expected: rows now carry `confidence`. Record the high-confidence vs low-confidence split per repo.

- [ ] **Step 3: Compute high-confidence precision + recall (measurement, no production change)**

Cross-reference the labelled dataset (TP/FP) against the high-confidence findings:
- **High-confidence precision** = (high-confidence ∧ TP) / (high-confidence flagged). Target ≥0.90.
- **High-confidence recall (integrity check)** = of all labelled TPs, the fraction that are HIGH confidence. Must stay high — if real drift is landing in low-confidence, that's a defect (the AST roles are over-demoting real drift).
- Report both, plus what fraction of the FPs moved to low-confidence (the precision win) and WHY each (which AST role).

- [ ] **Step 4: Write the measurement report + decide**

Write `.superpowers/sdd/color-confidence-measure-report.md`: high-confidence precision, high-confidence recall, the demotion breakdown by role, and the verdict: does high-confidence precision clear ≥0.90 at maintained recall? This decides whether Tasks 3-5 (promotion) proceed or color stays experimental with the honest number.

- [ ] **Step 5: Commit the harness change**

```bash
git add scripts/harvest-color-findings.ts packages/core/tests/tools/harvest-color.test.ts
git commit -m "feat(tools): harvest emits per-finding confidence (high-confidence measurement)"
```

> **GATE:** If Step 3 shows high-confidence precision < 0.90 OR high-confidence recall dropped (real drift demoted), STOP the promotion path. Report the honest number; color stays experimental; the AST grading still ships (it improves the default report's signal). Tasks 3-5 proceed ONLY if the gate is cleared.

---

## Task 3: Score only high-confidence color findings (CONDITIONAL — only if Task 2 clears)

**Files:**
- Modify: `packages/core/src/scorer.ts`
- Test: `packages/core/tests/scorer-confidence-filter.test.ts`

**Interfaces:** Consumes `Finding.confidence`. Produces: the scorer counts a `tokens/no-hardcoded-color` finding toward the score ONLY when `confidence === "high"`. Other rules unaffected.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/scorer-confidence-filter.test.ts
import { describe, it, expect } from "vitest";
import { scoreAxes } from "../src/scorer.js"; // use the actual scorer entry — confirm the export name

describe("scorer counts only high-confidence color findings", () => {
  it("ignores low-confidence color findings in the tokens axis score", () => {
    // two color findings, same axis/opportunities: one high, one low.
    // the score must reflect only the high-confidence one.
    // (construct the minimal AxisFindings input the scorer takes; assert the
    //  low-confidence color finding does not change the score vs omitting it.)
  });
});
```

(Fill the test body against the scorer's real input shape — read `scorer.ts` for the exact finding/axis input type; assert a low-confidence `tokens/no-hardcoded-color` finding does not move the score, while a high-confidence one does.)

- [ ] **Step 2: Run → fail** (`cd packages/core && pnpm vitest run tests/scorer-confidence-filter.test.ts`).

- [ ] **Step 3: Implement** — in `scorer.ts`, where findings are weighted per axis, skip `tokens/no-hardcoded-color` findings whose `confidence !== "high"`. Keep the filter narrow (only this rule) to avoid changing other rules' behavior.

- [ ] **Step 4: Green + full suite** — the scoring-contract test WILL change (color now scored differently); that's Task 5's v3 bump. Until then, expect the contract test to flag drift — Task 5 owns the version bump. Run the focused test green; note the contract drift for Task 5.

- [ ] **Step 5: Commit** — `git commit -m "feat(scoring): count only high-confidence color findings"`.

---

## Task 4: Hide low-confidence color findings in the default report (CONDITIONAL)

**Files:**
- Modify: `packages/core/src/reporters/terminal.ts` (`topFindings`, ~line 69)
- Test: `packages/core/tests/reporters/terminal-confidence.test.ts`

**Interfaces:** Default mode hides `confidence === "low"` color findings; `--verbose` shows all (badged). The handoff payload already includes all findings (verify it is unfiltered).

- [ ] **Step 1: Failing test** — assert `renderTerminal` in default mode omits a low-confidence color finding and includes a high-confidence one; in verbose mode includes both.
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** — in `topFindings`, when `opts.mode !== "verbose"`, filter out `confidence === "low"` findings before the top-N slice. Verbose keeps all. Add a low-confidence badge in verbose.
- [ ] **Step 4: Green + full suite + confirm the handoff payload (`commands/handoff.ts`) still includes low-confidence findings (verbose-equivalent).**
- [ ] **Step 5: Commit** — `git commit -m "feat(report): hide low-confidence color findings by default; --verbose shows all"`.

---

## Task 5: Vendor fixtures + measure into catalogue + conditional v2→v3 promotion (CONDITIONAL)

**Files:**
- Create: `packages/core/fixtures/reliability/color/{positive,false-friend,low-confidence}/`
- Modify: `validation/adapters/tokens-no-hardcoded-color.ts`, `src/reliability/catalogue/sub-axes.ts`, `src/scorer.ts` (`CURRENT_SCORING_VERSION`), `tests/scoring-contract.test.ts`, `CHANGELOG.md`, `.changeset/`.

**Interfaces:** Consumes the high-confidence measurement (Task 2) + the confidence-filtered scorer (Task 3). Produces the promoted `tokens.color` (iff gate cleared) + the v3 scoring version.

- [ ] **Step 1: Vendor a representative high-confidence labelled corpus** as fixtures (positives = high-confidence TPs, false-friends = high-confidence FPs; plus a `low-confidence/` set proving the demotion). The adapter's matrix is built over the HIGH-confidence corpus so `deriveMeasurement` yields the high-confidence precision/recall/N.
- [ ] **Step 2: Wire the adapter + measure** (the Task 7/N+1 one-liner from the color-to-90 plan), write the derived numbers into the `tokens.color` row. Coherence test passes.
- [ ] **Step 3: Evaluate `shouldPromote`** on the high-confidence numbers. If `false` → STOP, color stays experimental, honest number published, no bump (commit the measurement + docs only). If `true` → proceed.
- [ ] **Step 4: Promote (v2→v3)** — add a `scoring-v3` `LOCKED` entry (compute fixture scores with color high-confidence-scored), bump `CURRENT_SCORING_VERSION`, set `tokens.color` `status: stable` + `contributesToScore: true`. Run `scoring-contract.test.ts` green (v2 untouched). Regenerate docs.
- [ ] **Step 5: CHANGELOG + changeset (minor) + commit** — note color promoted via high-confidence AST grading; Health Score now scoring-v3; consumers re-baseline.

---

## Self-Review

**1. Spec coverage:**
- AST role grading → Task 1. ✓
- Score precision on high-confidence subset → Task 2 (measure) + Task 3 (scorer). ✓
- Default report hides low-confidence; verbose/handoff show all → Task 4. ✓
- Integrity guardrail (low-conf = functional roles only; high-conf recall measured) → Task 2 Step 3 (recall check) + the gate. ✓
- Conditional v2→v3 promotion → Task 5. ✓
- Honest fallback (experimental if <90%) → Task 2 GATE + Task 5 Step 3. ✓
- rgba overlays stay high-confidence → Task 1 role analyzer demotes only the 3 roles; rgba alpha keeps the existing medium logic. ✓

**2. Placeholder scan:** Task 1's "exact ts-morph calls are the implementer's to wire" is bounded by the 5 explicit return values + 5 test cases + the named AST patterns (assignment-to-fillStyle, default-value position, JSX svg attr) — a measure-then-implement against concrete tests, not a placeholder. Task 3 Step 1 test body references the scorer's real input shape (the implementer reads scorer.ts) — concrete enough given the assertion is specified. All commands runnable.

**3. Type consistency:** `classifyColorRole` return union (`canvas|default-prop|svg-art|styling|unknown`) is consistent across Task 1 + Task 2. `confidence` (`high|medium|low`) consistent across Tasks 1-5. `Finding.confidence` is the existing field.

## Risks (from spec)

- Confidence-as-dumping-ground → the integrity guardrail + Task 2's high-confidence recall check (the gate).
- High-confidence set too narrow → Task 2 measurement reveals it; honest fallback.
- 90% not guaranteed even here → Task 2 is the decision gate; Tasks 3-5 only run if it clears.
- Per-finding ts-morph re-parse cost → bounded ancestor walk + shared project cache; acceptable (color findings are not enormous); degrade-to-high on failure.
