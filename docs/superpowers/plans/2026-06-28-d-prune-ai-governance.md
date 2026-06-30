# D — prune ai-governance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **EXECUTION GATE:** Do NOT start until PR #223 (`feat/color-to-90`) has merged to `main`. The 7 rules being retired are introduced on that branch. Execute on a FRESH branch off the new `main` (e.g. `chore/prune-ai-governance`).

**Goal:** Retire the 7 experimental, off-score ai-governance rules, tightening the axis to its 11 deterministic scored rules, with zero scoring impact and a config-compatibility shim so configs referencing the retired ids degrade gracefully.

**Architecture:** Two moves: (1) a `RETIRED_RULE_IDS` tolerance shim in the config layer so a `.lyse.yaml` referencing a retired id warns-and-ignores instead of hard-erroring; (2) a removal sweep deleting the 7 rules and every reference (registry, types, catalogue, adapters, coverage, docs, manifest) plus two cosmetic reconciliations (gap-report hint strings, one test fixture). All 7 are `contributesToScore: false`, so the score and `scoringVersion` are unchanged.

**Tech Stack:** TypeScript (strict), vitest, the reliability catalogue + autonomous validation engine, Changesets.

## Global Constraints

- Strict TS: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`; ESM `.js` import specifiers.
- **No score change.** `tests/scoring-contract.test.ts` and `scoringVersion` (`scoring-v1.1`) MUST stay unchanged — this is the proof obligation. NO v2→v3 bump.
- The 7 retired ids (exact): `ai-governance/explainability-affordance`, `ai-governance/human-control-affordances`, `ai-governance/ai-marker-anti-patterns`, `ai-governance/disclaimer-present`, `ai-governance/value-gate-doc-present`, `ai-governance/ai-tokens-reserved`, `ai-governance/ai-token-requires-marker`.
- The 11 KEPT scored ai-governance rules are untouched: `ai-marker-component-present`, `ai-loading-error-states`, `ai-content-live-region`, `feedback-control-present`, `confidence-indicator-present`, `source-attribution-present`, `bot-identity-labeling`, `ai-token-misuse`, `interaction-pattern-docs`, `draft-attribution`, `product-analytics`.
- Determinism. No comments unless WHY is non-obvious. English only.
- Conventional Commits; fresh branch off `main` post-#223. Trailers on every commit (blank line before):
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01MoiMorjpU4r6NaYfctP96w`

## File Structure

- `src/config/rules-config.ts` — the shim (Task 1).
- `src/commands/audit-pipeline.ts` — emit the retirement warning (Task 1).
- 7 `src/rules/ai-governance-*.ts` — delete (Task 2).
- `src/rules/registry.ts`, `src/types.ts` (`BuiltInRuleId`), `src/reliability/catalogue/sub-axes.ts`, `validation/coverage.ts`, `validation/vocabulary-adapters.ts`, `src/reliability/gap-report.ts`, `rules-manifest.json`, 7 `docs/rules/*.md` — reconcile/delete (Task 2).
- `tests/config/rules-config.test.ts`, the formula-v1 test fixture, an audit-pipeline test — (Tasks 1, 2).
- `CHANGELOG.md`, `.changeset/socle-d.md` (Task 3).

---

## Task 1: config-compatibility shim (retired-id tolerance)

Done FIRST so that, after the sweep, no intermediate state breaks configs. The shim references ids as strings — it does not need the rules present.

**Files:**
- Modify: `src/config/rules-config.ts`, `src/commands/audit-pipeline.ts`
- Test: `tests/config/rules-config.test.ts`

**Interfaces:**
- Produces: `export const RETIRED_RULE_IDS: ReadonlySet<string>`; `export function findRetiredRuleIds(config: LyseConfig): string[]`. `findUnknownRuleIds(config, knownRuleIds)` keeps its signature but excludes retired ids from its result.

- [ ] **Step 1: Write the failing tests**

Add to `tests/config/rules-config.test.ts` (read the file first for its import style and existing helpers):

```typescript
import { describe, it, expect } from "vitest";
import { findUnknownRuleIds, findRetiredRuleIds, RETIRED_RULE_IDS } from "../../src/config/rules-config.js";
import type { LyseConfig } from "../../src/types.js";

describe("retired rule id tolerance", () => {
  const known = new Set(["tokens/no-hardcoded-color", "components/contracts-strictness"]);

  it("does NOT report a retired id as unknown", () => {
    const cfg: LyseConfig = { rules: { "ai-governance/disclaimer-present": "off" } };
    expect(findUnknownRuleIds(cfg, known)).toEqual([]);
  });

  it("findRetiredRuleIds returns retired ids present in config, sorted", () => {
    const cfg: LyseConfig = { rules: { "ai-governance/value-gate-doc-present": "off", "ai-governance/disclaimer-present": "off" } };
    expect(findRetiredRuleIds(cfg)).toEqual([
      "ai-governance/disclaimer-present",
      "ai-governance/value-gate-doc-present",
    ]);
  });

  it("a genuinely unknown (non-retired) id is still reported", () => {
    const cfg: LyseConfig = { rules: { "tokens/not-a-real-rule": "off" } };
    expect(findUnknownRuleIds(cfg, known)).toEqual(["tokens/not-a-real-rule"]);
  });

  it("RETIRED_RULE_IDS holds exactly the 7 retired ids", () => {
    expect(RETIRED_RULE_IDS.size).toBe(7);
    expect(RETIRED_RULE_IDS.has("ai-governance/ai-tokens-reserved")).toBe(true);
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `cd /Users/noechague/dev/lyse/packages/core && pnpm vitest run tests/config/rules-config.test.ts`
Expected: FAIL — `findRetiredRuleIds` / `RETIRED_RULE_IDS` not exported.

- [ ] **Step 3: Implement the shim**

In `src/config/rules-config.ts`, add at the top (after imports):

```typescript
// Rule ids retired in the ai-governance prune (sub-project D). A `.lyse.yaml`
// that still references one is tolerated: it is NOT a hard error (unlike a
// genuine typo), it is warned-and-ignored. Kept as a const so the audit
// pipeline can surface a precise retirement warning.
export const RETIRED_RULE_IDS: ReadonlySet<string> = new Set([
  "ai-governance/explainability-affordance",
  "ai-governance/human-control-affordances",
  "ai-governance/ai-marker-anti-patterns",
  "ai-governance/disclaimer-present",
  "ai-governance/value-gate-doc-present",
  "ai-governance/ai-tokens-reserved",
  "ai-governance/ai-token-requires-marker",
]);
```

Change `findUnknownRuleIds` to exclude retired ids:

```typescript
export function findUnknownRuleIds(
  config: LyseConfig,
  knownRuleIds: ReadonlySet<string>,
): string[] {
  const rules = config.rules;
  if (!rules) return [];
  return Object.keys(rules)
    .filter((id) => !knownRuleIds.has(id) && !RETIRED_RULE_IDS.has(id))
    .sort();
}
```

Add `findRetiredRuleIds`:

```typescript
export function findRetiredRuleIds(config: LyseConfig): string[] {
  const rules = config.rules;
  if (!rules) return [];
  return Object.keys(rules)
    .filter((id) => RETIRED_RULE_IDS.has(id))
    .sort();
}
```

- [ ] **Step 4: Run → pass**

Run: `cd /Users/noechague/dev/lyse/packages/core && pnpm vitest run tests/config/rules-config.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the warning in audit-pipeline**

In `src/commands/audit-pipeline.ts`, import `findRetiredRuleIds` alongside the existing `findUnknownRuleIds` import, and after the unknown-id hard-error block (around line 463-469), add:

```typescript
  for (const retired of findRetiredRuleIds(config)) {
    process.stderr.write(
      `[lyse] Warning: rule "${retired}" was retired and is ignored. Remove it from your .lyse.yaml \`rules:\` block.\n`,
    );
  }
```

(The retired id is not in the registry, so it is already absent from `activeRules` — no further filtering needed.)

- [ ] **Step 6: Commit**

```bash
git add src/config/rules-config.ts src/commands/audit-pipeline.ts tests/config/rules-config.test.ts
git commit -m "feat(config): tolerate retired rule ids (warn, don't error)"
```
(remember the trailers)

---

## Task 2: removal sweep

Remove the 7 rules and every reference, plus the two cosmetic reconciliations. This is one atomic deliverable — a partial removal will not compile (registry imports deleted files).

**Files:**
- Delete: `src/rules/ai-governance-explainability-affordance.ts`, `src/rules/ai-governance-human-control-affordances.ts`, `src/rules/ai-governance-ai-marker-anti-patterns.ts`, `src/rules/ai-governance-disclaimer-present.ts`, `src/rules/ai-governance-value-gate-doc-present.ts`, `src/rules/ai-governance-ai-tokens-reserved.ts`, `src/rules/ai-governance-ai-token-requires-marker.ts`, and the 7 matching `docs/rules/*.md`.
- Modify: `src/rules/registry.ts`, `src/types.ts`, `src/reliability/catalogue/sub-axes.ts`, `validation/coverage.ts`, `validation/vocabulary-adapters.ts`, `src/reliability/gap-report.ts`, `src/reliability/score/__tests__/formula-v1.test.ts`, `rules-manifest.json`.

- [ ] **Step 1: Enumerate every reference first**

Run, for each of the 7 ids, and record the hits:
```bash
cd /Users/noechague/dev/lyse/packages/core
for id in explainability-affordance human-control-affordances ai-marker-anti-patterns disclaimer-present value-gate-doc-present ai-tokens-reserved ai-token-requires-marker; do
  echo "### ai-governance/$id"; grep -rn "ai-governance/$id\|ai-governance.$id" src/ validation/ tests/ docs/ --include='*.ts' --include='*.json' --include='*.md' | grep -v "docs/superpowers/";
done
```
Every hit outside `docs/superpowers/` must be deleted or reconciled by the end of this task. The known touch-points are handled in Steps 2-8; use this list to catch anything else (e.g. an MCP/generated-pack reference). If a hit is in a KEPT rule's file (e.g. a comment), leave it.

- [ ] **Step 2: Delete the 7 rule files + their docs**

```bash
cd /Users/noechague/dev/lyse/packages/core
git rm src/rules/ai-governance-explainability-affordance.ts \
       src/rules/ai-governance-human-control-affordances.ts \
       src/rules/ai-governance-ai-marker-anti-patterns.ts \
       src/rules/ai-governance-disclaimer-present.ts \
       src/rules/ai-governance-value-gate-doc-present.ts \
       src/rules/ai-governance-ai-tokens-reserved.ts \
       src/rules/ai-governance-ai-token-requires-marker.ts
```
Then `git rm` the 7 matching files under `docs/rules/` (find them with `ls docs/rules/ | grep -E 'explainability|human-control|anti-pattern|disclaimer|value-gate|tokens-reserved|requires-marker'` from repo root — names mirror the rule).

- [ ] **Step 3: registry.ts**

Remove the 7 imports (`rExplainabilityAffordance`, `rHumanControlAffordances`, `rAiMarkerAntiPatterns`, `rDisclaimerPresent`, `rValueGateDocPresent`, `rAiTokensReserved`, `rAiTokenRequiresMarker`) and their entries in the `ruleObjects` array.

- [ ] **Step 4: types.ts — BuiltInRuleId**

Delete the 7 union members: `| "ai-governance/explainability-affordance"`, `| "ai-governance/human-control-affordances"`, `| "ai-governance/ai-marker-anti-patterns"`, `| "ai-governance/disclaimer-present"`, `| "ai-governance/value-gate-doc-present"`, `| "ai-governance/ai-tokens-reserved"`, `| "ai-governance/ai-token-requires-marker"`.

- [ ] **Step 5: sub-axes.ts**

Delete the 7 `SubAxisRecord` entries (`ai-governance.explainability-affordance`, `ai-governance.human-control-affordances`, `ai-governance.ai-marker-anti-patterns`, `ai-governance.disclaimer-present`, `ai-governance.value-gate-doc-present`, `ai-governance.ai-tokens-reserved`, `ai-governance.ai-token-requires-marker`). Update the top-of-file count comment to the new total (73 → 66).

- [ ] **Step 6: validation adapters + coverage**

- `validation/vocabulary-adapters.ts`: remove the 3 oracle adapters for `ai-marker-anti-patterns`, `disclaimer-present`, `value-gate-doc-present`, and their entries in that file's exported adapter array. Leave adapters for KEPT rules untouched.
- `validation/coverage.ts`: remove the coverage-universe entries for all 7 retired ids (the file lists rules the engine expects to classify). After this, `uncovered` must stay `[]` and there must be no entry for a now-missing rule.

- [ ] **Step 7: gap-report.ts cosmetic reconciliation**

`src/reliability/gap-report.ts` `NEXT_RUNG_REQUIREMENT` names retired rule ids in human-readable hints (level 0 references `ai-governance/ai-tokens-reserved`; level 3 references `disclaimer-present · human-control-affordances · explainability-affordance`). The governance-maturity SIGNALS come from `extractGovernanceSignals` (independent repo detection — NOT these rules), so the ladder still computes; only the hint wording references retired rules. Rephrase those two strings to capability language without retired rule ids, e.g.:
- level 0 → `"reserved AI-marker design tokens"`
- level 3 → `"AI governance affordances (a disclaimer, human-control, or explainability surface)"`

Do not change the maturity level logic in `src/reliability/governance-maturity.ts`.

- [ ] **Step 8: formula-v1.test.ts fixture swap**

`src/reliability/score/__tests__/formula-v1.test.ts` uses `ai-governance/disclaimer-present` as a synthetic finding to exercise the grace ramp (it does not load the registry, so it would still pass — but it must not reference a retired id). Replace every `disclaimer-present` occurrence in that test with a KEPT ai-governance rule already used there, `ai-governance/feedback-control-present` (sub-axis `ai-governance.feedback-control-present`), keeping the test's intent identical.

- [ ] **Step 9: Regenerate the manifest**

Run the generate script (`grep -n "manifest" package.json` → e.g. `pnpm run <generate-manifest>` or it runs inside `pnpm build`). Confirm it writes 66 rules. Do NOT hand-edit `rules-manifest.json`.

- [ ] **Step 10: Verify — score unchanged, parity, engine, suite**

Run each and confirm:
```bash
cd /Users/noechague/dev/lyse/packages/core
pnpm vitest run tests/scoring-contract.test.ts   # UNCHANGED, green — proof of no score change
pnpm vitest run                                   # full suite green; catalogue parity = 66; coverage uncovered=[]
pnpm validate:autonomous                          # ENGINE GATE PASS (3 retired adapters gone, no missing-rule ref)
pnpm build && node ../core/dist/cli.js audit fixtures/full-ds/ --json 2>/dev/null | grep finalScore   # score == pre-D value
```
If the full suite has a test asserting an exact ai-governance count or total-rule count, update it to the new totals (the parity test derives counts, so it auto-adjusts; only hard-coded literals need editing). If `validate:autonomous` reports a missing rule for a retired adapter, a coverage/adapter reference was missed — fix per Step 6.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(ai-governance): retire 7 experimental off-score rules (no score change)"
```
(remember the trailers)

---

## Task 3: CHANGELOG + changeset

**Files:**
- Modify: `CHANGELOG.md`
- Create: `.changeset/socle-d.md`

- [ ] **Step 1: CHANGELOG**

Add a `### Removed` entry under `## [Unreleased]` (create the `### Removed` heading if absent, placing it after `### Added`):

> - Retired 7 experimental, unmeasured ai-governance affordance checks (`ai-governance/explainability-affordance`, `human-control-affordances`, `ai-marker-anti-patterns`, `disclaimer-present`, `value-gate-doc-present`, `ai-tokens-reserved`, `ai-token-requires-marker`). They were always experimental and never contributed to the Health Score, so scores are unaffected. A `.lyse.yaml` that referenced any of them is now tolerated with a warning instead of erroring. This tightens the ai-governance axis to its deterministic, validated core (18 → 11 sub-axes; registry 73 → 66 rules).

- [ ] **Step 2: Changeset**

Create `.changeset/socle-d.md`:

```markdown
---
"@lyse-labs/lyse": minor
---

Retired 7 experimental, off-score ai-governance rules (sub-project D).

Removed `ai-governance/explainability-affordance`, `human-control-affordances`, `ai-marker-anti-patterns`, `disclaimer-present`, `value-gate-doc-present`, `ai-tokens-reserved`, and `ai-token-requires-marker` — all experimental, unmeasured, and never part of the Health Score, so scores are unaffected (`scoring-v1.1` unchanged). The ai-governance axis now reflects its 11 deterministic, validated rules. A `.lyse.yaml` referencing a retired id is tolerated with a warning instead of a hard error.
```

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md .changeset/socle-d.md
git commit -m "docs(changeset): D retire 7 experimental ai-governance rules"
```
(remember the trailers)

---

## Self-Review

**1. Spec coverage:**
- Retire exactly the 7 listed rules → Task 2 Steps 2-6. ✓
- Keep the 11 deterministic scored rules → not touched (Global Constraints + Step 1 grep guards against collateral). ✓
- Zero score change / no v2→v3 bump → scoring-contract assertion in Step 10; all 7 off-score. ✓
- Config-tolerance shim (RETIRED_RULE_IDS, findRetiredRuleIds, no hard-error, warning) → Task 1. ✓
- Genuinely-unknown ids still hard-error → Task 1 Step 1 test + the `&& !RETIRED_RULE_IDS.has(id)` filter only excludes retired. ✓
- Maturity-ladder reconciliation (gap-report strings; signals independent) → Task 2 Step 7. ✓
- Regenerate manifest, parity 66, coverage uncovered=[] → Steps 9-10. ✓
- CHANGELOG + changeset → Task 3. ✓

**2. Placeholder scan:** No TBD/TODO. The Step 1 grep + Step 10 "update any hardcoded count" are concrete safety nets over enumerated known touch-points, not vague directives. All code blocks are complete.

**3. Type consistency:** `RETIRED_RULE_IDS: ReadonlySet<string>` and `findRetiredRuleIds(config: LyseConfig): string[]` used identically in Task 1 code and audit-pipeline wiring. The 7 ids are spelled identically across the shim, the BuiltInRuleId deletions, the sub-axes deletions, and the CHANGELOG. Count math consistent: 73 → 66 rules, 18 → 11 ai-governance sub-axes.

## Risks

- **Hidden consumer of a retired rule.** The Step 1 grep is the guard. Most likely spots: `validation/coverage.ts`, `validation/vocabulary-adapters.ts`, `gap-report.ts`, MCP `suggest_fix` auto-fixable set, i18n vocabulary, fixtures. If `validate:autonomous` errors on a missing rule, a coverage/adapter ref was missed.
- **`extractGovernanceSignals` independence.** Confirmed: maturity signals come from independent repo detection, not the retired rules' findings — so the ladder keeps working and the score's grace ramp (driven by `aiMarkerCount`) is unaffected. If a future reader doubts this, the scoring-contract test (Step 10) is the backstop.
- **Execution timing.** Must run AFTER #223 merges, off the new `main` — otherwise the rules to retire aren't present.
