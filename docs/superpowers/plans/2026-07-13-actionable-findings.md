# Actionable Findings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship score projection, fix-group-grouped top findings, the migration-scale advisory, and recipe links in `findings.json`, per `docs/superpowers/specs/2026-07-13-actionable-findings-design.md`.

**Architecture:** One pure grouping module (`report/fix-groups.ts`) feeds three consumers: the audit pipeline (computes `meta.projection` while scorer inputs are in scope), the terminal reporter (grouped top findings + projection line + migration-scale suffix), and the agent handoff (migration-scale instruction block + helpUri-enriched findings.json). No Health Score change.

**Tech Stack:** TypeScript strict ESM (`.js` specifiers), vitest (CI-run only), the tsc sandbox harness for byte-verified terminal rendering (vitest cannot run in this environment).

## Global Constraints

- **No Health Score change.** `scorer.ts` untouched; `meta.projection` is additive presentation math. `lyse.json` gains only `meta.projection`; SARIF/TSV/HTML byte-identical; `--format=table`/`eslint` unchanged.
- Strict TS: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`. No new dependencies. No comments unless WHY is non-obvious. English only.
- Determinism: stable sorts everywhere (gain desc, then count desc, then key asc).
- vitest cannot run here: every rendering change is byte-verified via the harness at `/tmp/claude-0/-home-user-lyse/2d620c4b-d2ec-5e7a-817c-28ce628e1c66/scratchpad/term-check/`; every pure module is executed via a compiled check script. CI is the merge gate.
- Changesets: `actionable-findings-projection` (minor, covers projection+grouping+advisory), `handoff-recipe-links` (patch). CHANGELOG `[Unreleased]` entries for both.

## File Structure

- Create `packages/core/src/report/fix-groups.ts` — grouping + ranking + projection (pure).
- Create `packages/core/tests/report/fix-groups.test.ts`, `packages/core/tests/report/projection.test.ts`.
- Modify `packages/core/src/types.ts` — `meta.projection` type; `packages/core/src/config/schema.ts` (+ JSON schema + parity test) — `advisory.migrationScaleFileCount`.
- Modify `packages/core/src/commands/audit-pipeline.ts` — compute projection after scoring.
- Modify `packages/core/src/reporters/score-card.ts` (projection line), `packages/core/src/reporters/terminal.ts` (grouped topFindings), their tests + snapshot.
- Modify `packages/core/src/agent/payload.ts` (migration-scale block), `packages/core/src/agent/handoff.ts` (helpUri enrichment), their tests.

---

### Task 1: `report/fix-groups.ts` — grouping, ranking, projection

**Files:**
- Create: `packages/core/src/report/fix-groups.ts`
- Modify: `packages/core/src/types.ts` (add `ProjectionMeta` to `meta`)
- Test: `packages/core/tests/report/fix-groups.test.ts`, `packages/core/tests/report/projection.test.ts`

**Interfaces (produced — Tasks 2-4 rely on these exact shapes):**

```ts
export interface FindingGroup {
  key: string;            // fixGroup.key when present, else ruleId
  ruleId: string;
  from?: string;          // fixGroup.from
  to?: string;            // fixGroup.to (single-candidate replacement)
  findings: Finding[];
  fileCount: number;      // distinct location.file count
  migrationScale: boolean;
}
export function groupFindings(findings: Finding[], migrationScaleFileCount: number): FindingGroup[];
// Sorted: findings.length desc, then key asc. migrationScale = fileCount >= threshold.

export interface ProjectionEntry {
  key: string; ruleId: string; from?: string; to?: string;
  count: number; files: number; gain: number; migrationScale: boolean;
}
export interface ProjectionMeta { top: ProjectionEntry[]; totalGainTop3: number }
export function computeProjection(
  groups: FindingGroup[],
  allFindings: Finding[],
  opportunitiesByAxis: Record<AxisName, number>,
  scoreOpts: ScoreOptions,
  finalScore: number | "N/A",
  cap?: number, // default 3
): ProjectionMeta | undefined;  // undefined when finalScore is "N/A" or no group has gain > 0
```

`computeProjection`: take the top `cap * 2` groups by count as candidates; for each, `scoreFromFindings(allFindings minus group.findings, opportunitiesByAxis, scoreOpts)`; gain = max(0, projected − finalScore); keep gain > 0; sort gain desc, count desc, key asc; slice `cap`. `totalGainTop3` = one more scorer run with ALL top-entry findings removed (NOT the sum — gains don't add linearly).

- [ ] **Step 1: failing tests.** fix-groups.test.ts: fixGroup-key grouping vs ruleId fallback; deterministic order; distinct-file counting (same file twice = 1); migrationScale at/below threshold. projection.test.ts: hand-computed 2-axis fixture (e.g. tokens 10 opp / 4 warning findings in one group → removing them lifts the axis to 100; assert exact gain), cap honored, zero-gain omission, `finalScore: "N/A"` → undefined, determinism (two calls deep-equal).
- [ ] **Step 2: implement** per the interfaces above. `import { scoreFromFindings, type ScoreOptions } from "../scorer.js";` — check the actual scorer export names first and adapt imports (NOT the formula).
- [ ] **Step 3: verify by execution.** Compile the module + a check script in the sandbox harness (stub only `../types.js` imports if needed — scorer.ts is dependency-light; copy it in) and run every test case as eq() checks. All green.
- [ ] **Step 4: commit** `feat(report): fix-group grouping + deterministic score projection`.

### Task 2: pipeline computes `meta.projection`; config knob

**Files:**
- Modify: `packages/core/src/commands/audit-pipeline.ts` (~line 623, after `scoreFromFindings` and `grade`), `packages/core/src/config/schema.ts`, `packages/core/schemas/v1/lyse-config.json` (locate exact path), `packages/core/src/types.ts` if LyseConfig lives there
- Test: extend `packages/core/tests/config/schema-json-parity.test.ts` battery; add a pipeline-level unit if an existing pipeline test file covers meta fields (check `grep -rn "meta.layer4" packages/core/tests` for the pattern to follow)

**Interfaces:**
- Consumes: `groupFindings`, `computeProjection` (Task 1).
- Produces: `result.meta.projection?: ProjectionMeta`; config `advisory?: { migrationScaleFileCount?: number }` (zod: optional object, int ≥ 2; default applied at use site: 40).

- [ ] **Step 1: failing test** — schema parity: a config with `advisory: { migrationScaleFileCount: 25 }` accepted by both zod and JSON schema; `{ migrationScaleFileCount: 1 }` rejected by both.
- [ ] **Step 2: implement.** In the pipeline: `const groups = groupFindings(runResult.findings, config.advisory?.migrationScaleFileCount ?? MIGRATION_SCALE_FILE_COUNT_DEFAULT)` (export the default=40 from fix-groups.ts); `const projection = computeProjection(groups, runResult.findings, runResult.opportunitiesByAxis, { aiGovernanceGrace }, scoring.finalScore)`; attach `...(projection ? { projection } : {})` into `result.meta` alongside layer4/coverage.
- [ ] **Step 3: verify** — grep-level wiring check + reread; the pure math is already execution-verified (Task 1). Confirm JSON reporter passes `meta` through untouched (read `reporters/json.ts`).
- [ ] **Step 4: commit** `feat(audit): attach deterministic score projection to result.meta`.

### Task 3: terminal — projection line, grouped top findings, migration-scale suffix

**Files:**
- Modify: `packages/core/src/reporters/score-card.ts`, `packages/core/src/reporters/terminal.ts`
- Test: `packages/core/tests/reporters/score-card.test.ts`, `packages/core/tests/reporters/terminal.test.ts` + snapshot

**Interfaces:**
- Consumes: `result.meta.projection` (Task 2 shape), `groupFindings` (Task 1) for display grouping when projection is absent.
- Produces: card line `↗ fix the top N drift groups → +M pts` (unicode; ascii `^`; omitted when absent/0); grouped default-mode topFindings; per-group migration suffix `⚠ migration-scale (N files) — sample before you sweep`.

- [ ] **Step 1: failing tests.** Card: projection line rendered (uses `+M pts`), omitted when meta.projection absent; still inside the box (uniform width). Terminal: default mode groups (one block for 12 same-fixGroup findings with `×12` and "one fix clears all 12 findings."), verbose stays flat, migration suffix appears only for a flagged group, "N more groups" wording.
- [ ] **Step 2: implement.** Card: one `wrap(...)` line after the gauge row, only when `result.meta?.projection?.totalGainTop3 > 0`. Terminal `topFindings`: default mode groups via `groupFindings(findings, threshold-from-meta-or-default)` — prefer ranking by `meta.projection` order for the groups it names, then count desc; verbose/`--limit` keep the existing flat path unchanged.
- [ ] **Step 3: harness byte-verification.** Recompile card+terminal in the sandbox; print the new standard-fixture render; paste into the snapshot (escape backticks); re-run to `SNAPSHOT MATCH: byte-identical`. Render the projection fixture variant and eyeball box integrity.
- [ ] **Step 4: changeset `actionable-findings-projection` (minor) + CHANGELOG.**
- [ ] **Step 5: commit** `feat(terminal): projection line + fix-grouped top findings + migration-scale advisory`.

### Task 4: handoff — migration-scale block + helpUri in findings.json

**Files:**
- Modify: `packages/core/src/agent/payload.ts`, `packages/core/src/agent/handoff.ts`
- Test: the existing agent tests (`grep -rln "buildHandoffPayload\|findings.json" packages/core/tests`) — extend, follow their fixture style

**Interfaces:**
- Consumes: `groupFindings` (Task 1); `getRegisteredRuleMeta(ruleId)?.helpUri` (already used in payload.ts:35-38).
- Produces: findings.json entries typed `Finding & { helpUri?: string }`; a migration-scale instruction block per flagged group in the prompt.

- [ ] **Step 1: failing tests.** findings.json write includes helpUri for a rule with registered meta and omits the key when absent (exactOptionalPropertyTypes: spread `...(helpUri ? { helpUri } : {})`). Payload prompt: for a ≥threshold group, contains "representative sample" and "sign-off"; below threshold, does not.
- [ ] **Step 2: implement.** handoff.ts: enrich at serialization (`findings.map(f => ({ ...f, ...(getRegisteredRuleMeta(f.ruleId)?.helpUri ? { helpUri: ... } : {}) }))`). payload.ts: for migration-scale groups append the block: `Migration-scale (N files): fix a representative sample (~5 files), re-run \`lyse audit --scope uncommitted\`, confirm the recipe holds, then STOP and ask the maintainer to sign off before sweeping the rest.`
- [ ] **Step 3: verify** — execute payload-building via the harness with a synthetic 45-file group (payload.ts is dependency-light; stub rule-meta lookup).
- [ ] **Step 4: changeset `handoff-recipe-links` (patch) + CHANGELOG.**
- [ ] **Step 5: commit** `feat(handoff): recipe links in findings.json + migration-scale sampling instruction`.

### Task 5: whole-wave review

- [ ] **Step 1:** review-package over the wave's commits; dispatch the final reviewer (most capable model) with this plan + the spec; triage everything.
- [ ] **Step 2:** ONE fix subagent for the complete findings list; re-review; push.

## Self-Review

**1. Spec coverage:** projection engine+placement (T1/T2), card line (T3), grouped topFindings + verbose fallback (T3), migration-scale const+config+CLI+handoff (T2/T3/T4), helpUri (T4), tests incl. determinism (T1-T4), changesets/CHANGELOG (T3/T4). Gap: none found.
**2. Placeholder scan:** the two "check the actual export/path first" notes are bounded lookups, not TBDs; all steps carry concrete shapes or exact strings.
**3. Type consistency:** `FindingGroup`/`ProjectionEntry`/`ProjectionMeta` defined once (T1), consumed by name in T2-T4; threshold default exported from fix-groups.ts and consumed in T2/T3.
