# Sub-project D — prune ai-governance — Design

> Final socle sub-project. Retires the 7 experimental/off-score ai-governance
> rules, tightening the axis to its deterministic, validated core. **No score
> change** (the cut rules never contributed to the Health Score). The original
> "v2→v3 score bump" is decoupled — it was for *promoting* socle rules, which is
> blocked on the measurement campaign. Execute AFTER PR #223 merges, on a fresh
> branch off the new `main`.

## Goal

The ai-governance axis has 18 sub-axes: 11 deterministic scored rules (the
validated core) and 7 experimental, off-score, mostly-LLM-driven affordance
checks that ship unmeasured. D retires the 7, so the axis reflects only what is
measured and deterministic. The 600-expert report prioritized the code-side
socle; the speculative AI-governance affordance checks were an over-investment
the experts under-weighted.

## Rules retired (all `status: "experimental"`, `contributesToScore: false`)

| rule id | llmDriven | note |
| --- | --- | --- |
| `ai-governance/explainability-affordance` | yes | speculative affordance |
| `ai-governance/human-control-affordances` | yes | speculative affordance |
| `ai-governance/ai-marker-anti-patterns` | yes | speculative affordance |
| `ai-governance/disclaimer-present` | yes | speculative affordance |
| `ai-governance/value-gate-doc-present` | yes | speculative governance doc |
| `ai-governance/ai-tokens-reserved` | no | deterministic but recall 0.57, unmeasured |
| `ai-governance/ai-token-requires-marker` | no | deterministic but recall 0.20, unmeasured |

The 11 deterministic scored ai-governance rules are KEPT unchanged:
`ai-marker-component-present`, `ai-loading-error-states`, `ai-content-live-region`,
`feedback-control-present`, `confidence-indicator-present`, `source-attribution-present`,
`bot-identity-labeling`, `ai-token-misuse`, `interaction-pattern-docs`,
`draft-attribution`, `product-analytics`.

## Key property: zero scoring impact

Every retired rule is `contributesToScore: false`. Removing them leaves the
scorer's denominator and every scored sub-axis untouched, so:

- `tests/scoring-contract.test.ts` (the locked score table) MUST stay unchanged
  — it is the proof of no score change.
- `scoringVersion` stays `scoring-v1.1` — NO v2→v3 bump. The bump that the
  program reserved for D was about *promoting* experimental socle rules to
  scored; that promotion is blocked on the (Bench-walled) measurement campaign
  and is explicitly NOT part of this sub-project.

This is a rule-set reduction (the manifest shrinks; the rules disappear from
output), not a scoring change.

## Removal mechanics (per retired rule)

Delete, for each of the 7:
- the rule source file in `src/rules/`,
- its `BuiltInRuleId` union member in `src/types.ts`,
- its `SubAxisRecord` entry in `src/reliability/catalogue/sub-axes.ts` (and
  update the top-of-file count comment),
- its validation adapter (in `validation/adapters/*` or the relevant
  `validation/*-adapters.ts`) and any reference in the adapter aggregation
  array,
- its coverage classification entry (the file that classifies rules for the
  completeness gate),
- its `docs/rules/*.md` doc and any reference in docs indices.

Then regenerate `rules-manifest.json` via the generate script (never
hand-edit). Registry: 73 → **66 rules**; ai-governance sub-axes 18 → 11.

Before deleting, grep the codebase for each rule id to catch any non-obvious
consumer (MCP `suggest_fix`, generated-pack wiring, i18n vocabulary, fixtures,
other rules). A retired rule must leave no dangling reference.

## Config-compatibility shim (`src/config/rules-config.ts`)

Today an unknown rule id in `.lyse.yaml`'s `rules:` block is a hard error
(`audit-pipeline.ts` throws via `findUnknownRuleIds`). Deleting these ids would
break any config that references them. To avoid the upgrade footgun:

- Add `export const RETIRED_RULE_IDS: ReadonlySet<string>` = the 7 ids.
- `findUnknownRuleIds` filters out ids in `RETIRED_RULE_IDS`, so a retired id is
  NOT reported as unknown (no hard error).
- Add `export function findRetiredRuleIds(config: LyseConfig): string[]`
  returning the retired ids present in `config.rules`, sorted.
- In `audit-pipeline.ts`, after the unknown-id check, for each retired id
  present emit `[lyse] Warning: rule "<id>" was retired in v<version> and is
  ignored` to stderr. The id is dropped (the rule no longer exists), contributes
  no findings and no opportunities.

A genuinely-unknown id (typo, not retired) STILL hard-errors — the shim is
exact to the 7.

## Testing

- `tests/scoring-contract.test.ts` — UNCHANGED and green (no score change).
- Catalogue parity test — registry rule count == sub-axes count (66) after the
  removals.
- Coverage completeness — `uncovered = []` (the removed rules and their
  classifications go together).
- `pnpm validate:autonomous` — ENGINE GATE PASS with the 7 adapters gone (the
  engine iterates the remaining adapters; no missing-rule reference).
- New `rules-config` tests: (a) `{ rules: { "ai-governance/disclaimer-present": "off" } }`
  → `findUnknownRuleIds` returns `[]` and `findRetiredRuleIds` returns that id;
  (b) `{ rules: { "tokens/not-a-real-rule": "off" } }` → still reported unknown.
- New audit-pipeline test (or extend existing): a config with a retired id runs
  without throwing and prints the retirement warning.
- Full suite green; smoke `node packages/core/dist/cli.js audit packages/core/fixtures/full-ds/`
  → score stable (same value as before D).

## Architecture / files

- Modify: `src/types.ts` (drop 7 `BuiltInRuleId` members), `src/reliability/catalogue/sub-axes.ts`
  (drop 7 entries + count comment), `src/rules/registry.ts` (drop 7 imports +
  array members), the coverage classification file, the validation adapter
  aggregation, `rules-manifest.json` (regenerated), `src/config/rules-config.ts`
  (shim), `src/commands/audit-pipeline.ts` (retirement warning).
- Delete: 7 `src/rules/*.ts`, their adapters, their `docs/rules/*.md`.
- Tests: `tests/config/rules-config.test.ts` (extend), an audit-pipeline test,
  and confirm the catalogue/coverage/scoring-contract tests still pass.
- `CHANGELOG.md` + `.changeset/socle-d.md`.

## Global constraints

- Strict TS (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`,
  `verbatimModuleSyntax`); ESM `.js`. Determinism. No LLM. English only.
- No score change; `scoringVersion` unchanged. No comments unless WHY is
  non-obvious.
- Conventional Commits. Execute on a fresh branch off `main` AFTER #223 merges
  (the 7 rules + their catalogue entries are introduced on `feat/color-to-90`).

## Non-goals

- The v2→v3 score bump / promoting socle rules (blocked on the measurement
  campaign — a separate, later effort).
- Touching the 11 kept deterministic ai-governance rules.
- The advisor layer ([[advisor-layer-idea]], trigger "couche conseiller") — last.
- Permanently forbidding the 7 ideas: a `lyse-internal` note records that any of
  them may return if the measurement campaign later validates it.

## CHANGELOG / changeset framing

> **Removed** — Retired 7 experimental, unmeasured ai-governance affordance
> checks (`explainability-affordance`, `human-control-affordances`,
> `ai-marker-anti-patterns`, `disclaimer-present`, `value-gate-doc-present`,
> `ai-tokens-reserved`, `ai-token-requires-marker`). They were always
> experimental and never contributed to the Health Score, so scores are
> unaffected. A `.lyse.yaml` that referenced any of them is tolerated with a
> warning instead of erroring. This tightens the ai-governance axis to its
> deterministic, validated core.

Changeset bump: `minor` (rule-set reduction with a compatibility shim; no score
change, no API break — retired ids degrade gracefully).
