# Measurement campaign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize the color harvest harness to ALL rules, measure real precision on the local lyse-bench tier-1 corpus, and emit a per-rule promotability report — autonomously (local clone + local audit; no billing/CI). Structural rules auto-labelled; detection rules LLM-judged (agent-cli, no API key) with a human packet for uncertain cases.

**Architecture:** Tooling under `scripts/` + a taxonomy map under `src/`. Clone tier-1 at pinned SHAs → run `auditDirectory(staticOnly)` per repo → emit per-rule findings with context → label (auto for structural, LLM-judge for detection) → report. The FIRST pass writes NO catalogue changes; it produces the harness + report + human packets only.

**Tech Stack:** TypeScript (strict), tsx scripts, vitest, the existing `auditDirectory` pipeline, `codemods/safety.ts` confidence grading, `src/llm/filter-stage.ts` rubric + `src/llm/connectors` agent-cli connector.

## Global Constraints

- Strict TS (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`); ESM `.js` specifiers.
- **No catalogue change / no score change in this pass.** Output is the harness + `docs/superpowers/measurement-report.{md,json}` + human packets. Promotion (sub-axes edits + the v2→v3 bump) is a SEPARATE later step.
- **`llm-provisional` labels NEVER promote a rule.** Promotion needs `auto` (structural) or `human-validated` (detection) labels — the color lesson.
- **Recall stays synthetic** (adapters' positive fixtures + metamorphic), tagged `recall: synthetic` in the report — never presented as real-corpus recall.
- Render-only rules (`a11y/runtime-axe`, `tokens/rendered-token-fidelity`) reported `not-measured`, never 100%.
- Determinism where possible: pinned SHAs, sorted output. The LLM-judge is non-deterministic; its rows are tagged `llm-provisional`.
- The cloned corpus (`.bench-corpus/`) is gitignored; the report is committed. No billing/CI dependency.
- No comments unless WHY is non-obvious. English only. Conventional Commits; branch `feat/color-to-90` (or a branch off it). Trailers on every commit (blank line before):
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01MoiMorjpU4r6NaYfctP96w`

## File Structure

- `packages/core/src/reliability/measure/rule-measure-kind.ts` — explicit taxonomy map (Task 1).
- `scripts/clone-bench-corpus.ts` — clone tier-1 at pinned SHAs (Task 2).
- `scripts/harvest-findings.ts` — generalized harness, all rules (Task 3).
- `packages/core/src/reliability/measure/auto-label.ts` — structural-rule deterministic labelling (Task 4).
- `packages/core/src/reliability/measure/judge.ts` — detection-rule LLM-judge via agent-cli + packet emission (Task 5).
- `scripts/measure-rules.ts` — orchestrator → report (Task 6).
- Tests: `tests/reliability/measure/*.test.ts`, `tests/tools/harvest-findings.test.ts`.
- Modify: `.gitignore` (+ `.bench-corpus/`), `package.json` (scripts `clone:bench`, `measure:rules`).
- Output: `docs/superpowers/measurement-report.{md,json}` (Task 7).

---

## Task 1: rule taxonomy map + parity

**Files:**
- Create: `packages/core/src/reliability/measure/rule-measure-kind.ts`
- Test: `tests/reliability/measure/rule-measure-kind.test.ts`

**Interfaces:**
- Produces: `export type MeasureKind = "structural" | "detection" | "render-only";`
  `export const RULE_MEASURE_KIND: Record<string, MeasureKind>;`
  `export function measureKindOf(ruleId: string): MeasureKind;`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/reliability/measure/rule-measure-kind.test.ts
import { describe, it, expect } from "vitest";
import { RULE_MEASURE_KIND, measureKindOf } from "../../../src/reliability/measure/rule-measure-kind.js";
import { ruleObjects } from "../../../src/rules/registry.js";

describe("rule-measure-kind", () => {
  it("classifies every registry rule (no rule unclassified)", () => {
    const unclassified = ruleObjects.map((r) => r.id).filter((id) => !(id in RULE_MEASURE_KIND));
    expect(unclassified).toEqual([]);
  });
  it("has no stale ids (every mapped id is a real rule)", () => {
    const ids = new Set(ruleObjects.map((r) => r.id));
    const stale = Object.keys(RULE_MEASURE_KIND).filter((id) => !ids.has(id));
    expect(stale).toEqual([]);
  });
  it("classifies render-only rules", () => {
    expect(measureKindOf("a11y/runtime-axe")).toBe("render-only");
    expect(measureKindOf("tokens/rendered-token-fidelity")).toBe("render-only");
  });
  it("classifies a presence rule as structural and a token rule as detection", () => {
    expect(measureKindOf("ai-surface/component-manifest-json")).toBe("structural");
    expect(measureKindOf("tokens/no-hardcoded-color")).toBe("detection");
  });
});
```

- [ ] **Step 2: Run → fail** (`cd /Users/noechague/dev/lyse/packages/core && pnpm vitest run tests/reliability/measure/rule-measure-kind.test.ts`) — module missing.

- [ ] **Step 3: Implement the map**

Create the file with one entry PER registry rule. Derive the initial classification by axis/intent, then hand-verify:
- `render-only`: `a11y/runtime-axe`, `tokens/rendered-token-fidelity`.
- `structural` (flag absence/structure): all `ai-surface/*`, all `versioning/*`, `tokens/dtcg-conformance`, `tokens/description-coverage`, `tokens/theme-modes-present`, `tokens/css-custom-property-export`, `tokens/responsive-breakpoints`, the deterministic `ai-governance/*` presence checks (`ai-marker-component-present`, `ai-content-live-region`, `ai-loading-error-states`, `feedback-control-present`, `confidence-indicator-present`, `source-attribution-present`, `bot-identity-labeling`, `interaction-pattern-docs`, `draft-attribution`, `product-analytics`), `stories/coverage`, `stories/props-documented`, `stories/usage-examples`, `naming/*`, `components/doc-comments`, `ai-governance/ai-tokens-reserved`, `ai-governance/ai-token-requires-marker`, `ai-governance/ai-marker-anti-patterns`, `ai-governance/disclaimer-present`, `ai-governance/explainability-affordance`, `ai-governance/human-control-affordances`, `ai-governance/value-gate-doc-present`.
- `detection` (flag a value/pattern in code): all `tokens/no-hardcoded-*`, `tokens/no-hardcoded-gradient`, `tokens/container-query`, `tokens/no-hardcoded-media-query`, `components/no-arbitrary-tailwind`, `components/no-style-escape-hatch`, `components/standardized-variant-props`, `components/contracts-strictness`, `components/no-native-shadows`, `components/icon-decorative-aria`, `components/svg-viewbox`, `components/no-icon-fonts`, `ai-governance/ai-token-misuse`, the static a11y rules (`a11y/essentials`, `a11y/contrast-tokens`, `a11y/interactive-role-name`, `a11y/focus-visible`, `a11y/semantic-html`, `a11y/forced-colors`, `a11y/html-lang`, `a11y/inclusive-language`, `a11y/prefers-reduced-motion`).

```typescript
export type MeasureKind = "structural" | "detection" | "render-only";

// Why explicit (not inferred): a reviewer must be able to audit which rules
// get deterministic auto-labelling vs LLM-judging vs no measurement.
export const RULE_MEASURE_KIND: Record<string, MeasureKind> = {
  // ... one line per rule id, value the kind ...
};

export function measureKindOf(ruleId: string): MeasureKind {
  const k = RULE_MEASURE_KIND[ruleId];
  if (k === undefined) throw new Error(`Unclassified rule for measurement: ${ruleId}`);
  return k;
}
```

(Fill every id; the parity test in Step 1 enforces completeness. If unsure on a borderline rule, classify `detection` — it routes to the judge + human packet, the safe default that never auto-asserts.)

- [ ] **Step 4: Run → pass.** Fix any unclassified id the parity test names.

- [ ] **Step 5: Commit** (`feat(measure): rule measurement-kind taxonomy`).

---

## Task 2: clone tier-1 corpus

**Files:**
- Create: `scripts/clone-bench-corpus.ts`
- Modify: `.gitignore`, `package.json`
- Test: `tests/tools/clone-bench-corpus.test.ts`

**Interfaces:**
- Produces: `export interface BenchEntry { repo: string; url: string; sha: string }`
  `export function parseBenchYaml(yamlText: string): BenchEntry[];`
  CLI: `tsx scripts/clone-bench-corpus.ts [--tier 1|2] [--dest .bench-corpus]` clones each entry at its SHA (shallow, detached) into `<dest>/<repo-leaf>`, skipping any already present.

- [ ] **Step 1: Write the failing test** (pure parse — no network):

```typescript
import { describe, it, expect } from "vitest";
import { parseBenchYaml } from "../../scripts/clone-bench-corpus.js";

const YAML = `- repo: shadcn-ui/ui
  url: https://github.com/shadcn-ui/ui
  sha: 4a4dc8eb0fc793d8e9225e780183ad605f15d2c2
  framework: react
- repo: mantinedev/mantine
  url: https://github.com/mantinedev/mantine
  sha: babd4ef64a41791a209bb671d10ea9e001824bb5`;

describe("parseBenchYaml", () => {
  it("extracts repo/url/sha entries", () => {
    const entries = parseBenchYaml(YAML);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ repo: "shadcn-ui/ui", url: "https://github.com/shadcn-ui/ui", sha: "4a4dc8eb0fc793d8e9225e780183ad605f15d2c2" });
  });
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement.** Parse `lyse-bench/corpus/tier1.yaml` (use the `yaml` package already in the repo, or a minimal block parser). Clone:
```typescript
// per entry, leaf = repo.split("/").pop()
execFileSync("git", ["clone", "--filter=blob:none", "--no-checkout", url, dest], {...});
execFileSync("git", ["-C", dest, "checkout", sha], {...});
```
Resolve `tier1.yaml` relative to the script: `../lyse-bench/corpus/tier1.yaml` from repo root (the bench repo is a sibling). If the bench dir is absent, exit with a clear message. Skip repos whose dest already exists.

- [ ] **Step 4: Run → pass** (the parse test).

- [ ] **Step 5: `.gitignore` + package.json.** Add `.bench-corpus/` to `.gitignore`. Add `"clone:bench": "tsx scripts/clone-bench-corpus.ts"` to root `package.json` scripts.

- [ ] **Step 6: Commit** (`feat(measure): clone-bench-corpus script (pinned SHAs)`).

---

## Task 3: generalized harvest harness

**Files:**
- Create: `scripts/harvest-findings.ts`
- Test: `tests/tools/harvest-findings.test.ts`

**Interfaces:**
- Consumes: `auditDirectory`, `buildClassifyContext`, `populateConfidence` (`codemods/safety.ts`).
- Produces: `export interface FindingRow { ruleId: string; repo: string; file: string; line: number; snippet: string; fileType: string; confidence: Confidence }`
  `export async function collectAllFindings(rootDir: string): Promise<FindingRow[]>` — like `collectColorFindings` but for EVERY finding (no per-rule filter), `ruleId` on each row, sorted by `(ruleId, repo, file, line)`.

- [ ] **Step 1: Write the failing test** — point it at a tiny temp dir with two repo subdirs containing seeded drift (mirror `tests/tools/harvest-color.test.ts`'s setup), assert rows carry `ruleId` and are sorted. (Read `tests/tools/harvest-color.test.ts` first and mirror its temp-repo construction.)

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement** by generalizing `scripts/harvest-color-findings.ts`: copy `collectColorFindings`, remove the `.filter((f) => f.ruleId === "tokens/no-hardcoded-color")` line so all findings are emitted, add `ruleId: f.ruleId` to each row, and sort by `(ruleId, repo, file, line)`. Reuse `snippetAround`, `buildClassifyContext`, `populateConfidence` unchanged. CLI: `tsx scripts/harvest-findings.ts <corpusDir> <outDir>` writes `<outDir>/<ruleId-slug>.jsonl` (slug = ruleId with `/` → `__`).

- [ ] **Step 4: Run → pass.**

- [ ] **Step 5: Commit** (`feat(measure): generalized harvest harness (all rules)`).

---

## Task 4: structural auto-labelling

**Files:**
- Create: `packages/core/src/reliability/measure/auto-label.ts`
- Test: `tests/reliability/measure/auto-label.test.ts`

**Interfaces:**
- Consumes: `FindingRow` (Task 3), `measureKindOf` (Task 1).
- Produces: `export type Label = { verdict: "tp" | "fp"; source: "auto"; reason: string };`
  `export function autoLabel(row: FindingRow, repoDir: string): Label;` — ONLY valid for `structural` rules (throws if called on a non-structural ruleId).

- [ ] **Step 1: Write the failing test**

A structural finding flags a genuine absence/malformation → `tp`; a finding pointing at a file/structure that actually satisfies the rule → `fp`. Example: `ai-surface/component-manifest-json` flagged "no manifest" but a `lyse.manifest.json` exists at `repoDir` → `fp`; genuinely absent → `tp`. Build two temp repos and assert.

```typescript
import { describe, it, expect } from "vitest";
import { autoLabel } from "../../../src/reliability/measure/auto-label.js";
// ... temp-repo helpers ...
describe("autoLabel (structural)", () => {
  it("labels a genuinely-absent manifest finding tp", () => { /* repo without manifest */ });
  it("labels a finding fp when the structure actually satisfies the rule", () => { /* repo with valid manifest */ });
  it("throws on a detection rule", () => {
    expect(() => autoLabel({ ruleId: "tokens/no-hardcoded-color", repo: "x", file: "a.css", line: 1, snippet: "", fileType: ".css", confidence: "high" }, "/tmp")).toThrow();
  });
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement.** `autoLabel` re-derives ground truth for structural rules by re-inspecting `repoDir`: most structural rules are "absence" checks, so a finding is `tp` when the rule's required artifact is genuinely absent/malformed. Implement a small per-rule verifier table keyed by ruleId; default for a structural rule with no specific verifier: treat the finding as `tp` with reason `"presence-check: artifact absent (default)"` ONLY when the rule is a pure absence check — otherwise return `fp` and record `"needs-verifier"` so the report flags it for review (never silently assert tp). Throw for non-structural ruleIds.

(YAGNI: write verifiers for the structural rules that actually produce findings on the corpus — discover that set from Task 3's harvest output. Rules that produce zero findings on tier-1 need no verifier; the report records them as `n=0`.)

- [ ] **Step 4: Run → pass.**

- [ ] **Step 5: Commit** (`feat(measure): deterministic auto-label for structural rules`).

---

## Task 5: detection-rule LLM-judge + human packets

**Files:**
- Create: `packages/core/src/reliability/measure/judge.ts`
- Test: `tests/reliability/measure/judge.test.ts`

**Interfaces:**
- Consumes: `FindingRow`, the `ConnectorClient` type + `resolveConnector` (`src/llm/connectors/`), the rubric/prompt approach from `src/llm/filter-stage.ts` (`buildFilterPrompt` if exported; else mirror it).
- Produces: `export type JudgeLabel = { verdict: "tp" | "fp"; source: "llm-provisional"; confidence: number } | { verdict: "uncertain"; source: "llm-provisional"; confidence: number };`
  `export async function judgeFindings(rows: FindingRow[], opts?: { connector?: ConnectorClient; confThreshold?: number }): Promise<Map<FindingRow, JudgeLabel>>;`
  `export function packetFor(ruleId: string, rows: { row: FindingRow; label: JudgeLabel }[]): string;` — markdown packet of uncertain/low-confidence rows for the human.

- [ ] **Step 1: Write the failing test** with an INJECTED fake connector (zero real spawn), mirroring `src/llm/__tests__` filter-stage tests:

```typescript
import { describe, it, expect } from "vitest";
import { judgeFindings, packetFor } from "../../../src/reliability/measure/judge.js";

const fakeConnector = { /* returns canned verdicts: index0 violation conf .95, index1 fp conf .9, index2 uncertain conf .4 */ } as any;

describe("judgeFindings", () => {
  it("labels confident verdicts tp/fp llm-provisional and uncertain below threshold", async () => {
    const rows = [/* 3 FindingRow */];
    const out = await judgeFindings(rows, { connector: fakeConnector, confThreshold: 0.7 });
    // index0 -> tp, index1 -> fp, index2 -> uncertain
  });
  it("packetFor renders uncertain rows as markdown for human labelling", () => {
    const md = packetFor("tokens/no-hardcoded-color", [/* one uncertain row */]);
    expect(md).toContain("tokens/no-hardcoded-color");
    expect(md).toContain("[ ] TP");
  });
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement.** Group rows by file, build the judge prompt (reuse `buildFilterPrompt` from filter-stage if exported; otherwise replicate the rubric prompt — the rubric text is in `filter-stage.ts`). Call the connector (default `resolveConnector` → the agent-cli connector, no API key). Parse the three-way verdict + confidence (same shape as filter-stage's `Verdict`). Map: confidence ≥ threshold && `violation` → `tp`; ≥ threshold && `fp` → `fp`; else `uncertain`. All `source: "llm-provisional"`. `packetFor` renders uncertain rows + the judge's note as a `- [ ] TP / [ ] FP` checklist markdown.

- [ ] **Step 4: Run → pass.**

- [ ] **Step 5: Commit** (`feat(measure): LLM-judge (agent-cli) + human packets for detection rules`).

---

## Task 6: report orchestrator

**Files:**
- Create: `scripts/measure-rules.ts`
- Modify: `package.json`
- Test: `tests/tools/measure-report.test.ts` (unit-test the pure report-building function, not the full run)

**Interfaces:**
- Consumes: `collectAllFindings`, `measureKindOf`, `autoLabel`, `judgeFindings`, `packetFor`, `wilsonLowerBound` (from the reliability catalogue), the synthetic recall from the existing validation engine output (`validation/report.json`).
- Produces: `export interface RuleMeasurement { ruleId: string; kind: MeasureKind; nSamples: number; precisionMeasured: number | null; precisionWilsonLowerBound: number | null; recallSynthetic: number | null; labelSource: "auto" | "llm-provisional" | "human-validated" | "none"; verdict: "promotable" | "walled" | "pending-human" | "not-measured" }`
  `export function buildReport(perRule: RuleMeasurement[]): { md: string; json: RuleMeasurement[] };`

- [ ] **Step 1: Write the failing test** for `buildReport` with hand-built `RuleMeasurement[]`: assert a structural rule at precision LB 0.95 → `promotable`; a detection rule with only llm-provisional labels → `pending-human`; a measured-low rule → `walled`; a render-only rule → `not-measured`. Assert the markdown groups by verdict and the JSON is sorted by ruleId.

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement.** `buildReport` computes the verdict bucket per the spec rules (promotable requires precision Wilson LB ≥ 0.90 AND recall gate AND labelSource ∈ {auto, human-validated}). The orchestrator CLI: harvest → for each finding route by `measureKindOf` (structural → autoLabel, detection → judgeFindings) → aggregate per rule (precision = tp/(tp+fp), Wilson LB via `wilsonLowerBound`, nSamples = tp+fp) → pull synthetic recall from `validation/report.json` → `buildReport` → write `docs/superpowers/measurement-report.{md,json}` + packets under `.bench-corpus/packets/`. Add `"measure:rules": "tsx scripts/measure-rules.ts"` to package.json.

- [ ] **Step 4: Run → pass** (the `buildReport` unit test).

- [ ] **Step 5: Commit** (`feat(measure): report orchestrator + verdict buckets`).

---

## Task 7: run the campaign + commit the report

**Files:**
- Create (committed): `docs/superpowers/measurement-report.{md,json}`
- Output (gitignored): `.bench-corpus/` + `.bench-corpus/packets/`

- [ ] **Step 1: Clone the corpus**

Run: `pnpm clone:bench` (clones tier-1, 20 repos, pinned SHAs, into `.bench-corpus/`). If a repo fails to clone (network hiccup), re-run; the script skips already-present repos. Record which repos cloned.

- [ ] **Step 2: Run the measurement**

Run: `pnpm build && pnpm measure:rules` (build first so `auditDirectory` runs on compiled dist if the harness imports dist; if it imports `src` via tsx, skip build). This harvests all findings, auto-labels structural rules, LLM-judges detection rules (agent-cli — slow; expect minutes), and writes the report + packets.

- [ ] **Step 3: Sanity-check the report**

Confirm: every registry rule appears exactly once; render-only rules are `not-measured`; no detection rule is marked `promotable` on `llm-provisional` labels alone (must be `pending-human`); structural rules carry `auto` labels; `n=0` rules (no findings on tier-1) are recorded, not dropped. If the run was partial (some repos failed, or the judge bailed on budget), the report MUST say so — record the repos covered and the findings judged vs deferred. No silent truncation.

- [ ] **Step 4: Commit the report (NOT the corpus)**

```bash
git add docs/superpowers/measurement-report.md docs/superpowers/measurement-report.json
git commit -m "docs(measure): first-pass per-rule measurement report (tier-1)"
```
(remember the trailers; `.bench-corpus/` is gitignored and must NOT be staged)

- [ ] **Step 5: Surface the human packets**

List the `pending-human` rules and the packet paths so the user can validate the detection-rule samples. Those validated labels (a later step) are what actually gate promotion.

---

## Task 8: CHANGELOG note

- [ ] **Step 1:** No user-facing runtime change (tooling + report only). Add a brief CHANGELOG note under an `### Added` or internal note: "Added a measurement harness (`pnpm measure:rules`) that scores rule precision against the local bench corpus; first-pass report at `docs/superpowers/measurement-report.md`." No changeset (no package behavior change) — confirm with the existing changeset policy; if a changeset is required for any `scripts/`+`package.json` change, add a `patch` changeset noting the new dev script.
- [ ] **Step 2:** Commit (`docs(changelog): measurement harness`).

---

## Self-Review

**1. Spec coverage:** corpus clone (Task 2) ✓; general harness (Task 3) ✓; taxonomy (Task 1) ✓; auto-label structural (Task 4) ✓; LLM-judge + packets (Task 5) ✓; report + verdict buckets + promotion-gate honesty (Task 6) ✓; run + report + no-corpus-commit (Task 7) ✓; recall-synthetic + render-only-not-measured + llm-provisional-never-promotes enforced in Tasks 1/5/6 ✓.

**2. Placeholder scan:** The "fill every id" (Task 1) and "write verifiers for structural rules that produce findings" (Task 4) are bounded by parity tests and the harvest output, not open-ended. The judge-prompt "reuse buildFilterPrompt if exported else mirror" is concrete against an existing file. No TBD/TODO.

**3. Type consistency:** `FindingRow` (Task 3) consumed by `autoLabel` (Task 4), `judgeFindings` (Task 5), the orchestrator (Task 6). `MeasureKind`/`measureKindOf` (Task 1) used in Tasks 4/6. `Label`/`JudgeLabel` verdict shapes align with the report's `labelSource`. `RuleMeasurement` is the single report row type.

## Risks

- **Run cost/time (Task 7).** 20 repos × audit + LLM-judging many findings via agent-cli is slow and token-heavy. Mitigation: the harness supports a repo subset; if the full 20 is too heavy in one pass, run a representative subset (e.g. the 8 already in `lyse-bench/calibration/per-repo/`) and record coverage in the report. No silent truncation.
- **agent-cli connector availability.** If `resolveConnector` yields no usable connector in this environment, the detection rules fall back to `pending-human` with raw packets (no pre-label) — degrade gracefully, never block the structural measurement.
- **Auto-label correctness.** A wrong structural verifier inflates precision. Tests (Task 4) + the "needs-verifier → fp, flagged" default guard against silent tp assertions.
- This pass changes NO catalogue numbers; promotion is a later, human-gated step.
