# `versioning/semver-versioning` — Design

**Track:** lyse-labs/lyse-internal#131 · **Area J — Versioning** · dimension "Semver in package.json"

**Goal:** A deterministic rule that verifies the design system declares a valid
semver `version` in `package.json`, promoted as the 10th scored sub-axis.

## Decision (locked)

Lenient **presence + validity** check. A `version` that parses as semver
(`x.y.z`, optional pre-release / build) passes — including `0.x` (pre-1.0 is
valid semver). Chosen over a stricter "stability contract (≥1.0.0)" variant to
protect real-world precision: many legitimately-maintained design systems are
`0.x`, and penalizing them would inject false positives into the benchmark
corpus that backstops Lyse's credibility. The "0.x = no stability contract"
nuance can ship later as a non-scored `info` signal.

## Behavior

- **Axis:** `ai-surface` (Face A, AI-consumable contract). The `versioning/*`
  ruleId prefix intentionally differs from the axis — allowed.
- **Severity:** `warning`, one finding at repo level, anchored at
  `package.json:1`.
- **Where it looks:**
  1. Root `package.json`.
  2. If root has no valid-semver `version` (common for private monorepo
     roots), scan workspace manifests (`packages/*/package.json`).
  - **Pass if ANY** manifest declares a valid-semver `version`.
- **Warns when:** no `package.json` carries a valid-semver `version` field —
  i.e. field absent everywhere, or present-but-unparsable (`"latest"`,
  `"1.0"`, a date string).
- **Validity:** the official semver.org regex; no new dependency. Files read
  via the existing `readJsonIfSmall` helper pattern (skips pathological sizes).
- **Allowlist:** a `lyse-disable versioning/semver-versioning` directive in the
  README marks the rule N/A.

## Components

- `packages/core/src/rules/versioning-semver-versioning.ts` — rule + exported
  `_internal` (`isValidSemver`, `findSemverManifest`, `isAllowlisted`).
- `packages/core/tests/rules/versioning-semver-versioning.test.ts` — ~8 tests:
  valid 1.x, valid 0.x, pre-release/build, workspace fallback, absent→warn,
  non-semver→warn, lyse-disable suppress, empty repoRoot, `isValidSemver`
  helper.
- Register in `registry.ts`; add `| "versioning/semver-versioning"` to the
  `BuiltInRuleId` union in `types.ts`.
- `docs/rules/versioning-semver-versioning.md` — rule doc (helpUri target).

## Scoring promotion

- Sub-axis `ai-surface.semver-versioning`, `deterministicValidator: true`,
  `contributesToScore` after promotion (synthetic precision = real for a
  presence/structure check).
- Recall suite:
  - Violations: 3 shapes (no version field / non-semver value / no
    package.json) × 12 variants = 36.
  - Compliant: 5 signals (1.x.y, 0.x.y, pre-release `-beta.1`, build `+sha`,
    workspace-only version) × 7 variants = 35.
- Gate: Wilson LB ≥0.90 on precision AND recall (n≥35).
- `write-subaxes --write` flips status to `stable` / `contributesToScore`.
- Coverage manifest area J: dimension "Semver in package.json" `none` →
  `stable-scored`; TOTAL scored 9 → 10.

## Smoke band

If `fixtures/full-ds` already ships a valid-semver `version`, the rule does not
fire → counted-findings band unchanged. Verify during implementation; recenter
the band only if it fires.

## Out of scope

- Release-automation detection (changesets / semantic-release) — separate
  maturity dimension.
- `0.x` stability-contract penalty — deferred to a future `info` signal.
