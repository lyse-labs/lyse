# Rule promotion — Phase A — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Determine which experimental socle rules can be DEFENSIBLY promoted to ≥90% precision/recall, by (1) batching the LLM-judge so detection can be measured at all, and (2) for each bounded-FP rule, hardening its adversarial validator AND confirming on the real bench corpus that the FP enumeration is complete. Phase A changes NO scores — it produces measured catalogue numbers (rules stay `experimental`/off-score) + a promotion-readiness report. Phase B (the score flip) is a separate, post-#223-merge effort.

**Architecture:** Per the spec (`docs/superpowers/specs/2026-06-28-rule-promotion-strategy-design.md`): a bounded-FP rule (syntactic/AST) can be proven correct by a comprehensive adversarial validator (every real FP class enumerated as `falseFriends`) at J=1.0 with enough positives for a tight Wilson LB — this is NOT a mutation-count artifact because there is no semantic gap. The real-corpus judge run is the COMPLETENESS guard: if the corpus surfaces an FP class absent from the fixtures, the rule is not bounded and drops to the semantic bucket.

**Tech Stack:** TypeScript (strict), vitest, the autonomous validation engine (`validation/`, `deriveMeasurement`, the catalogue-coherence keystone test), `wilsonLowerBound`, the measurement harness from the prior campaign (`scripts/measure-rules.ts`, `judge.ts`).

## Global Constraints

- Strict TS (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`); ESM `.js`.
- **NO score change in Phase A.** Every rule stays `contributesToScore: false`, `status: "experimental"`. Phase A only moves catalogue numbers from `null` to measured (still off-score). `scoring-contract.test.ts` and `scoringVersion` MUST stay unchanged.
- **Honesty:** the catalogue-coherence keystone test is the guard — every catalogue number MUST equal `deriveMeasurement(adapter matrix)`. No hand-pasted constants. A bounded rule promotes-ready ONLY if the real-corpus confirmation finds NO new FP class; otherwise it stays unmeasured/semantic (record why).
- A promotion-ready verdict requires BOTH: adversarial validator J=1.0 over a comprehensive FP enumeration with enough positives that precision Wilson LB ≥ 0.90 AND recall Wilson LB ≥ 0.90, AND real-corpus precision Wilson LB ≥ 0.90 with no un-enumerated FP class.
- Determinism in fixtures; the judge is non-deterministic (confirmation only, tagged `llm-provisional`).
- No comments unless WHY is non-obvious. English. Conventional Commits; branch `feat/color-to-90`. Trailers on every commit (blank line before):
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01MoiMorjpU4r6NaYfctP96w`

## Bounded-FP rules in scope (the ~9)

`components/no-arbitrary-tailwind` (proof rule, Task 2), `components/no-style-escape-hatch`, `components/standardized-variant-props`, `stories/props-documented`, `stories/usage-examples`, `a11y/contrast-tokens`, `a11y/interactive-role-name`, `tokens/no-hardcoded-gradient`, `ai-surface/component-manifest-completeness`. (`contracts-strictness` already has an adversarial corpus + recall 1 — fold in if cheap.) Semantic rules `color`/`shadow` are OUT of Phase A.

## File Structure

- `packages/core/src/reliability/measure/judge.ts` — per-chunk batching (Task 1).
- Each bounded rule's oracle adapter (`validation/adapters/*` or `validation/*-adapters.ts`) — comprehensive `falseFriends` + ≥~35 positives.
- `src/reliability/catalogue/sub-axes.ts` — the measured (non-null, still off-score) entries, kept in sync by the coherence test.
- `scripts/measure-rules.ts` — feed the batched judge; emit a `promotion-ready` column.
- `docs/superpowers/promotion-readiness-report.{md,json}` (committed; corpus gitignored).

---

## Task 1: batch the LLM-judge per-chunk

**Files:**
- Modify: `packages/core/src/reliability/measure/judge.ts`
- Test: `packages/core/tests/reliability/measure/judge.test.ts`

**Interfaces:**
- `judgeFindings(rows, opts?)` signature UNCHANGED. Internally: replace the by-FILE grouping (one connector call per file) with by-CHUNK batching (one call per ≤`BATCH_SIZE` rows, across files). `buildJudgePrompt` already lists each finding by index with its `snippet` (not the file source), so cross-file batching needs no extra context.

- [ ] **Step 1: Write the failing test**

Add to `judge.test.ts` (mirror its existing fake-connector pattern — a `ConnectorClient` whose `complete` records call count and returns indexed verdicts):

```typescript
it("batches across files into ceil(N/BATCH) connector calls, not one per file", async () => {
  let calls = 0;
  const fake = {
    complete: async (msgs: { role: string; content: string }[]) => {
      calls++;
      // Echo a violation verdict for every index present in the prompt.
      const idxs = [...msgs[0]!.content.matchAll(/^(\d+) —/gm)].map((m) => Number(m[1]));
      return { text: JSON.stringify({ verdicts: idxs.map((i) => ({ index: i, verdict: "violation", confidence: 0.95 })) }) };
    },
  } as any;
  // 25 rows across 25 distinct files; BATCH_SIZE 20 → 2 calls (not 25).
  const rows = Array.from({ length: 25 }, (_, i) => ({ ruleId: "tokens/no-hardcoded-color", repo: "r", file: `f${i}.tsx`, line: 1, snippet: `x${i}`, fileType: ".tsx", confidence: "high" as const }));
  const out = await judgeFindings(rows, { connector: fake, confThreshold: 0.7 });
  expect(calls).toBe(2);
  expect(out.size).toBe(25);
  for (const [, label] of out) expect(label.verdict).toBe("tp");
});
```

- [ ] **Step 2: Run → fail** (`cd packages/core && pnpm vitest run tests/reliability/measure/judge.test.ts`) — current per-file logic makes 25 calls, not 2.

- [ ] **Step 3: Implement chunk batching**

In `judge.ts`: add `const BATCH_SIZE = 20;`. Replace the `byFile` grouping + per-file loop with: sort `rows` deterministically (by `ruleId, repo, file, line` — already the harvest order, but re-sort for safety), slice into chunks of `BATCH_SIZE`, and for each chunk call `connector.complete([{ role: "user", content: buildJudgePrompt(chunk) }])` ONCE. Keep the existing per-row index→verdict mapping, the confidence→label mapping, and the per-call `try/catch` → on error set every row in THAT chunk to `UNCERTAIN_FALLBACK` (chunk-scoped, not file-scoped). `buildJudgePrompt` is unchanged (it already indexes rows 0..n-1 within whatever list it's given — so indices are chunk-local; map back within the chunk).

- [ ] **Step 4: Run → pass** — the new test (2 calls) + all existing judge tests stay green.

- [ ] **Step 5: Commit** (`perf(measure): batch the LLM-judge per-chunk (cross-file) for feasible detection runs`).

---

## Task 2: PROOF — promote-ready `components/no-arbitrary-tailwind` end-to-end

This task proves the whole bounded-FP model on one rule before scaling. If it does NOT clear both gates, STOP and escalate (the model needs revision) rather than proceeding to Task 3.

**Files:**
- Modify: the `no-arbitrary-tailwind` oracle adapter in `packages/core/validation/adapters/component-adapters.ts`
- Modify: `packages/core/src/reliability/catalogue/sub-axes.ts` (the entry goes null → measured, still off-score)
- Modify: `packages/core/rules-manifest.json` (regenerate if needed)
- Output: a section in the readiness report (Task 4)

**Interfaces:**
- Consumes: the autonomous engine's `deriveMeasurement` (catalogue numbers must equal it), `wilsonLowerBound`, the batched judge (Task 1).

- [ ] **Step 1: Enumerate the real FP classes**

Read the rule (`src/rules/components-no-arbitrary-tailwind.ts`) and list every legitimate-use class that must NOT flag (the FP space). Known/likely: arbitrary values that ARE allowed — `var()`-based (`w-[var(--x)]`), calc/min/max with tokens, color brackets (owned by `tokens/no-hardcoded-color`, must not double-flag), arbitrary values in non-className strings, compiled/vendored CSS, story/demo files. Write them down in the task report — this list IS the `falseFriends` set and the corpus-confirmation checklist.

- [ ] **Step 2: Harden the adversarial validator**

In the adapter: expand `mutations` to **≥ 35 distinct positive cases** (real arbitrary-value drift: `p-[12px]`, `text-[14px]`, `w-[37px]`, `gap-[7px]`, `top-[3px]`, `h-[42px]`, … varied utilities/values) so a J=1 run yields precision Wilson LB ≥ 0.90 AND recall Wilson LB ≥ 0.90 (Wilson LB at N=35, 0 errors ≈ 0.90). Add a `falseFriends` array enumerating EVERY class from Step 1 (one fixture per class, several per class where the class has variants). Each falseFriend MUST be a case the rule correctly does NOT flag.

- [ ] **Step 3: Run the engine + sync the catalogue**

`cd packages/core && pnpm validate:autonomous`. The engine derives the matrix; the catalogue-coherence test forces `sub-axes.ts`'s `no-arbitrary-tailwind` entry to equal `deriveMeasurement(matrix)`. Update the entry to the derived numbers: `precisionMeasured`, `recallMeasured`, the two Wilson LBs, `nSamples`, `lastCalibrated` (use a date string — pass it in, do NOT call Date.now()). KEEP `status: "experimental"`, `contributesToScore: false` (NO promotion here — measured-but-off-score). Regenerate `rules-manifest.json`. Run `cd packages/core && pnpm vitest run` — coherence test + parity green; `scoring-contract` UNCHANGED (still off-score).

EXPECTED GATE 1: if J<1 (a falseFriend flags, or a mutation is missed), the rule is NOT clean — FIX the rule or record the genuine FP class as a real limitation (then the rule is semantic-leaning → may not promote). Do not force J=1 by deleting hard falseFriends — that would be the dishonesty the campaign exists to prevent.

- [ ] **Step 4: Real-corpus confirmation (completeness guard)**

Run the batched judge over the bench corpus for THIS rule:
`MEASURE_CAP=60 npx tsx scripts/measure-rules.ts .bench-corpus` (detection enabled — NOT structural-only), then inspect the `no-arbitrary-tailwind` rows in `docs/superpowers/measurement-report.json` + its packet. CONFIRM: (a) corpus precision Wilson LB ≥ 0.90 on the judged sample, and (b) every fp the judge/you find on real code maps to an FP class ALREADY in the Step-1 enumeration. If the corpus surfaces a NEW FP class → add it to `falseFriends`, re-run Step 3; if that new class is SEMANTIC (not syntactically enumerable) → the rule is NOT bounded → record it as semantic, do NOT mark promotion-ready.

- [ ] **Step 5: Record the verdict + commit**

Record in the task report: the FP-class list, the synthetic numbers (precision/recall/Wilson LB/N), the corpus-confirmation result, and the verdict (`promotion-ready` iff both gates green and enumeration complete). Commit:
```bash
git add packages/core/validation/adapters/component-adapters.ts packages/core/src/reliability/catalogue/sub-axes.ts packages/core/rules-manifest.json
git commit -m "feat(measure): harden no-arbitrary-tailwind adversarial validator + measure (off-score)"
```
(trailers; do NOT stage `.bench-corpus/`)

---

## Task 3: scale the recipe to the remaining bounded rules

Apply Task 2's exact recipe (enumerate FP classes → ≥35 positives + comprehensive `falseFriends` → engine + catalogue sync, still off-score → corpus confirmation → verdict) to each, ONE rule per sub-task (each is an independently reviewable deliverable). For each, name its FP classes up front:

- [ ] **`components/no-style-escape-hatch`** — FP classes: inline `style` on a NON-DS/raw-HTML element (not flagged), DS component without a `style` prop, `dsSelfMode`, spread props. Adapter in `component-adapters.ts`.
- [ ] **`components/standardized-variant-props`** — FP classes: a single style boolean (<2), generic state booleans (`disabled`/`loading`/…), non-boolean style-named props, cross-file prop types (unresolved → not flagged). Adapter in `component-adapters.ts`.
- [ ] **`stories/props-documented`** — FP classes: a story with `argTypes`, a story with arg'd named exports, components with no story (not counted), `dsSelfMode`, `storyIndex` null.
- [ ] **`stories/usage-examples`** — FP classes: ≥2 named exports, a single arg'd export, no story (not counted), `dsSelfMode`.
- [ ] **`a11y/contrast-tokens`** — FP classes: `var()`/token pairs (skipped, recall-bounded — note recall is intentionally < 1, so its RECALL gate may not reach 0.90; if so it stays experimental on recall grounds — record honestly), alpha/transparent/gradient/single-prop (skipped). This rule may be precision-promotable but recall-bounded; verdict accordingly.
- [ ] **`a11y/interactive-role-name`** — wraps `jsx-a11y/control-has-associated-label`; FP classes: aria-label'd controls, text-content controls, non-interactive elements. Likely high precision (mature upstream).
- [ ] **`tokens/no-hardcoded-gradient`** — already `deterministicValidator: true`; verify its adversarial set is comprehensive (FP classes: gradient referencing a token, vendored/compiled). Lowest-hanging.
- [ ] **`ai-surface/component-manifest-completeness`** — already `deterministicValidator: true`, but N was thin (3); expand positives to ≥35 for a tight Wilson LB. FP classes: complete manifests, absent manifest (owned by manifest-json).

Each sub-task: harden adapter, sync catalogue (off-score), corpus-confirm, record verdict, commit (`feat(measure): harden <rule> adversarial validator + measure (off-score)`). A rule that fails a gate is recorded `not-promotion-ready` with the reason (do not force it).

---

## Task 4: promotion-readiness report

**Files:**
- Modify: `scripts/measure-rules.ts` (add the `promotion-ready` verdict + a `gates` breakdown: syntheticPrecLB, syntheticRecallLB, corpusPrecLB, enumerationComplete)
- Output: `docs/superpowers/promotion-readiness-report.{md,json}`

- [ ] **Step 1:** Extend the report model with per-rule gate fields + a `promotion-ready` boolean (true iff syntheticPrecLB ≥ 0.90 AND syntheticRecallLB ≥ 0.90 AND corpusPrecLB ≥ 0.90 AND enumerationComplete). Unit-test the verdict logic (mirror the existing `buildReport` test).
- [ ] **Step 2:** Regenerate the report over the bounded rules; commit the report (`docs(measure): promotion-readiness report (Phase A)`). The `promotion-ready` list is the exact input Phase B (the v2→v3 bump) will consume.

---

## Self-Review

**1. Spec coverage:** judge batching (enables detection) → Task 1. Per-bounded-rule harden + corpus-confirm → Tasks 2-3. The completeness guard (corpus finds no new FP class, else drop to semantic) → Task 2 Step 4 + Task 3 per-rule. No-score-change / measured-but-off-score → Global Constraints + every catalogue-sync step. Promotion-readiness report (Phase B input) → Task 4. Color/shadow excluded → scope list. ✓

**2. Placeholder scan:** The per-rule FP-class lists are concrete starting enumerations (the implementer extends from reading each rule), not placeholders. "≥35 positives" is exact (Wilson LB math). The recipe is fully specified in Task 2 and referenced (not vaguely) in Task 3. No TBD.

**3. Type consistency:** catalogue entries use the existing `SubAxisRecord` shape; numbers come from `deriveMeasurement` (coherence-enforced). `judgeFindings` signature unchanged. The readiness report's gate fields are additive to the existing `RuleMeasurement`.

## Risks

- **A "bounded" rule turns out semantic** (corpus surfaces a non-enumerable FP class). That is a SUCCESS of the guard, not a failure — record it semantic, it stays experimental. The proof rule (Task 2) tests this before scaling.
- **Recall-bounded rules** (`contrast-tokens` skips var()) may clear precision but not recall ≥0.90 → not promotion-ready on recall grounds; record honestly (a later var()-wiring effort could lift recall).
- **Adding falseFriends forces catalogue numbers** (coherence test) — that is intended: the rule becomes measured-but-off-score in Phase A; Phase B flips off-score→scored.
- Phase B (the score flip) is explicitly NOT in this plan — it waits for #223 to merge and is the single deliberate v2→v3 bump.
