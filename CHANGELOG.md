# Changelog

All notable changes to Lyse will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **DTCG: recognize JSON-Pointer `$ref` aliases (Track #147).** Token aliasing previously only understood the curly-brace form (`"$value": "{color.brand}"`). The model now also treats the JSON-Pointer object form (`"$value": { "$ref": "#/color/brand" }`) as an alias — `isDtcgAlias` matches it and `parseAliasPath` resolves the pointer (RFC 6901 `~1`/`~0` unescaping, leading `#`/`/` tolerated). This flows to every consumer: `tokens/dtcg-conformance` validates `$ref` targets and flags broken ones (with the pointer shown in the message, no more `[object Object]`), and `tokens/deprecated-token-usage` detects a token that aliases a deprecated token via `$ref`. Recall-only — no scoring change.

- **SARIF: per-rule `properties.precision` + in-source `suppressions[]` (Track #142, residual).** Building on the `partialFingerprints` dedup hash (already live), each rule definition in `tool.driver.rules` now carries its measured `properties.precision` (sourced from the calibrated sub-axis catalogue; omitted for rules with no measured value), so code-scanning consumers can triage by reliability. Findings dismissed by an inline `lyse-disable` directive are no longer silently dropped from the SARIF output — they are emitted in `results[]` with `suppressions: [{ kind: "inSource", status: "accepted" }]`, which GitHub renders as *dismissed* while preserving dedup/trend data. The Health Score is unaffected: suppressed findings stay excluded from scoring exactly as before (a new `AuditResult.suppressedFindings` list carries them, omitted when empty).

- **SDK connector: native structured output + prompt caching (Track #145).** The Anthropic adapter now (1) accepts a `responseSchema` in `CompleteOptions` and, when set, forces a tool call matching that schema — so the returned text is **always valid JSON** (no regex `extractJson` fragility / parse-error fallback on the SDK path); and (2) marks the system/rubric prefix `cache_control: ephemeral`, so repeated per-file calls in a multi-file audit reuse it instead of re-billing the prefix (`cacheHit` now reflects `cache_read_input_tokens`). The precision filter passes its verdict schema as the first consumer. The stateless agent-cli / noop adapters ignore `responseSchema` (no behaviour change) — this hardening applies to the BYOK SDK path. Grader/judge schema threading + moving stage prefixes into a cached system message are follow-ups.

- **Maturity judge: per-signal evidence grounding (Track #72/#155).** The LLM maturity judge now requires a concrete, cited `evidence[<signal>]` quote for every signal it marks `true`; claimed-but-unevidenced signals are downgraded to `false`. This kills the over-detection seen in the first LLM-tier run (every AI-having DS inflated to L4). After grounding, the external-validity correlation vs Kavcic holds at **Spearman ρ 0.9817 (PASS)** and absolute levels are evidence-backed — Cloudscape corrected L4→L3 (exact). A generic mention of "AI" no longer counts.

- **Conformal confidence gate in `computeScoreV1` (Phase D, D-gov-2a — Track #115).** `ScoreInput` gains an optional `conformalSubAxes` map (subAxisId → confidence threshold θ). A finding in a conformal-gated sub-axis counts toward the score **only** if its `Finding.llmJudgement.confidence` is ≥ θ; sub-threshold and ungraded findings stay reported-only. Omitting the map is inert — scoring is byte-identical to today. This is the selective-prediction core: it lets graded governance (and color/spacing) sub-axes contribute to the trusted score by *abstaining* on low-confidence findings rather than forcing a verdict. Ships inert; thresholds are set per sub-axis once calibrated (D-gov-2b). `llmJudgement` is now also on the scoring-side `Finding`.

- **LLM governance grader now emits per-finding confidence (Phase D, D-gov-1 — Track #115).** The Layer-4 governance grader's prompt now requests a `confidence` (0..1) per proposed finding, and the hallucination validator attaches it to the surviving finding as `Finding.llmJudgement` (`{ verdict: "violation", confidence }`, clamped). Mirrors the precision-filter change (D1) so governance findings carry the same signal the conformal scoring gate will use to score only confident violations — for AI-having repos only (governance rules don't fire on no-AI systems, so N/A is emergent). Behaviour-preserving for scoring: the judgement is recorded, not yet consumed. Motivated by the #72 external-validity probe, which showed the trusted score is flat across the AI-readiness corpus because governance is *detected but unscored*.

- **LLM precision filter now emits a 3-way verdict + confidence (Phase D, D1 — Track #115).** The filter previously returned a binary `{ index, keep }`; it now returns `{ index, verdict: "violation" | "fp" | "uncertain", confidence: 0..1 }`. False positives (`fp`) are dropped as before; `violation`/`uncertain` are kept, and a valid verdict + numeric confidence is attached to the kept finding as `Finding.llmJudgement` (confidence clamped to `[0,1]`). The legacy `{ index, keep }` form is still parsed for robustness. This is behaviour-preserving for scoring — the judgement data is recorded but not yet consumed — and is the foundation for the conformal scoring gate (D2), which will let high-confidence color/spacing findings contribute to the trusted score while uncertain ones stay reported-only.

- **`tokens.theme-modes` promoted to the trusted score — 8th scored sub-axis (Track #127).** After fixing compound-selector detection (above), the recall-suite calibration cleared the promotion gate on both axes (recall Wilson LB **0.9036**, synthetic-precision Wilson LB **0.9011**, n=36 violation + 35 compliant fixtures), so `tokens/theme-modes-present` is now `stable` + `contributesToScore`. The `scoring-v1` trusted path now counts **8** sub-axes (was 7). `fixtures/full-ds` Health Score moved **91 → 88** — the fixture declares no light/dark mode signal, so the now-trusted rule fires; the smoke band was recentered to `[85, 91]` / counted-findings `[4, 6]` accordingly.

- **Deterministic finding order + parallel rule execution (Track #147).** `runRules` now runs every rule concurrently (`Promise.all`) — rules are stateless and receive read-only context, and `Promise.all` preserves input order so aggregation stays deterministic. Findings are sorted by a stable multi-key comparator (`severity → file → line → column`) instead of severity alone, so output order no longer depends on rule registration order — a prerequisite for clean output diffs, SARIF fingerprint stability, and per-rule snapshot tests.

### Fixed

- **`lyse explain --score <path>` now audits the given path (was: always cwd).** The `--score` breakdown ignored its positional argument and always audited `process.cwd()`, so `lyse explain --score ./some-ds` silently scored the current directory instead of the target. As a side effect the "First Trusted Score" smoke test was auditing its own runner cwd rather than the `full-ds` fixture it passed — meaning sub-axis promotions were never actually validated against the intended fixture. The positional is now treated as a repo path under `--score` (defaults to cwd when omitted). The smoke test now genuinely pins `full-ds` (88/5); band recentered to `[85, 91]` / counted `[4, 6]` to match the real target.

- **`tokens/no-hardcoded-spacing` precision: four real false-positive classes removed (Track #120, Phase B).** (1) **Zero with explicit units** — `0rem`/`0em`/`0.0rem` were flagged even though zero is zero regardless of unit (the zero-guard only fired for `px`). (2) **`var()` fallbacks** — a literal in `var(--token, 16px)` is tokenized usage (the `var()` reference is the real value; the fallback is dead code in a well-formed DS), not drift; a new `isInVarFallback` helper exempts it (handles nesting; non-`var` functions like `calc()` are unaffected). (3) **`@container` query preludes** — a dimension in `@container (width <= 400px)` is a breakpoint, not spacing (previously only `@media` was recognized). (4) **Multi-line block comments** — `isInCommentOrUrl` only checked the line prefix, so a value on a comment continuation line (`(-0.5px) align */`) leaked through; it now detects an open `/* … */` span. Measured effect on the cross-tool corpus (vs `stylelint-declaration-strict-value`): spacing precision-vs-tool rose to **94% on primer-css** and **85% on mantine** (pooled exact Wilson LB ≈ 0.85). The residual disagreement is dominated by stylelint *structural blind spots* (values inside `calc()`, Mantine's `rem()` helper, `inset-inline-*` logical properties), not Lyse errors — so spacing stays experimental (banking deferred to the Phase D LLM filter, which can adjudicate the debatable `calc()` nudges).

- **`tokens/theme-modes-present` now detects compound element class selectors (Track #127).** The `.dark`/`.light` class-convention signal required a non-letter before the dot, so common real-world conventions like `body.dark`, `html.light`, and `html.dark` (Tailwind v3 default) went undetected — under-counting theme-mode support on those design systems. The detector now matches `.dark`/`.light` as a class token anywhere (trailing `\b` still excludes `.darker` / `.lightbox`; CSS values never contain a literal `.dark`/`.light` token, so no leading guard is needed). This closes the gap that blocked the sub-axis's calibration precision.

- **SARIF `partialFingerprints` for GitHub code-scanning deduplication (Track #142).** Every SARIF result now carries `partialFingerprints["primaryLocationLineHash/v1"]` — a full SHA-256 (hex) of `${ruleId} ${relativeFilePath} ${startLine} ${message}`. GitHub Advanced Security uses this key to match findings across runs, preventing every CI run from creating duplicate alerts in the Security tab. The fingerprint is deterministic (no timestamps, no run-specific data), order-independent, and distinct for findings that differ in rule, file, or line.

### Added

- **SCSS ingestion now scans `@mixin` bodies (#167).** `transformScssToCss` previously blanked the entire `@mixin` block, so hardcoded values declared inside a mixin (`color: #fff; padding: 24px;`) escaped the token-drift rules — a recall gap for SCSS design systems that centralize declarations in mixins. The transform now blanks only the mixin's header line and closing brace, preserving the body (scanned as raw text). `@function` and `@include` stay fully blanked (SCSS logic, not CSS); single-line mixins still collapse to one blanked line; the line-count-preserving invariant is unchanged.

- **CSS-in-JS ingestion now covers Emotion (#166).** `extractCssInJs` previously recognized only `styled-components`; design systems built on **Emotion** had zero CSS-in-JS drift detected (a false sense of compliance). It now also extracts `@emotion/styled` (`styled.div`...``, API-identical), `css`...`` helpers from `@emotion/react` / `@emotion/css` / `styled-components` (named, `css as` aliased, and `@emotion/css` default), and named `styled` from `@emotion/react`. Pure recall gain to the existing token-drift rules; vanilla-extract's object syntax remains a follow-up.

- **MCP server exposes the rule contract as resources (#95).** The server now declares the `resources` capability and serves `lyse://rules` (the full rule manifest) and `lyse://rule/<ruleId>` (one rule's metadata) — read-only, from the in-memory manifest (no filesystem access). An agent can *read* the design-system rules up front and generate compliant code, instead of only discovering violations after calling `audit_file`. This is the AI-consumability Lyse measures in others, applied to its own surface.

- **MCP tools now expose `outputSchema` + return `structuredContent` (#95, architecture-audit P1 #6).** Both `audit_file` and `suggest_fix` declare a typed MCP `outputSchema` and return the result as `structuredContent` alongside the text mirror. MCP clients that support structured output get a validated, typed payload instead of re-parsing a JSON-in-text blob, and the server validates its own output against the schema before sending (SDK 1.29). This makes Lyse's own MCP server first-class for AI agents — the AI-consumability the tool measures in others. Behaviour-preserving for older clients (the `content` text is unchanged).

- **New scored rule `tokens/deprecated-token-usage` — 12th sub-axis (Track #131).** Walks the design system's DTCG token files (one address space across files) and flags any token whose `$value` aliases a token marked `$deprecated` — aliasing a deprecated token silently propagates a deprecated value to every consumer (including AI agents resolving the alias). Reports under the **tokens** axis. Deterministic structural check (alias resolution + `$deprecated` flag) → synthetic precision equals real; calibrated via the recall suite (36 violation + 35 compliant fixtures → recall Wilson LB **0.9036**, precision **0.9011**) and promoted to `stable` + `contributesToScore`. `scoring-v1` now counts **12** sub-axes (was 11); coverage area A gains the deprecated-token dimension. Fires only when a deprecated token exists *and* is aliased, so a system with no deprecations (or clean deprecations) produces no findings — `fixtures/full-ds` is unaffected (smoke band unchanged).

- **New scored rule `versioning/migration-guide-present` — 11th sub-axis (Track #131).** Checks whether the design system ships migration/upgrade guidance — a `MIGRATION.md` / `UPGRADING.md` file (root or under `docs/`), or a `## Migration` / `## Upgrading` heading inside the CHANGELOG/README. Emits one `warning` at repo level when none is found. Reports under the **ai-surface** axis — an agent upgrading an app across a breaking DS version needs a documented migration path. Calibrated via the recall suite (36 violation + 35 compliant fixtures → recall Wilson LB **0.9036**, precision **0.9011**) and promoted to `stable` + `contributesToScore`. `scoring-v1` now counts **11** sub-axes (was 10); coverage area J (Versioning) 50% → 75%. `fixtures/full-ds` Health Score **85 → 82** (no migration guide → the rule fires); smoke band recentered to `[79, 85]` / counted `[6, 8]`. Honest caveat documented: a migration guide is strictly necessary only once a DS has breaking changes, so a brand-new `0.x` system may legitimately lack one (allowlist directive available).

- **New scored rule `versioning/semver-versioning` — 10th sub-axis (Track #131).** Checks whether the design system declares a valid semver `version` in `package.json` (root or any workspace manifest in a monorepo); emits one `warning` at repo level when none is found (field absent, or a non-semver value like `"latest"` / `"1.0"` / a date). Lenient by design — `0.x` is valid semver and passes, protecting real-world precision on legitimately pre-1.0 design systems. Reports under the **ai-surface** axis (an agent editing against the DS needs a stable, machine-readable version to pin). Calibrated via the recall suite (36 violation + 35 compliant fixtures → recall Wilson LB **0.9036**, precision **0.9011**) and promoted to `stable` + `contributesToScore`. `scoring-v1` now counts **10** sub-axes (was 9); coverage area J (Versioning) 25% → 50%. With the `explain --score <path>` fix counting it on `fixtures/full-ds` (which ships no `version`), Health Score moved **88 → 85**; smoke band recentered to `[82, 88]` / counted `[5, 7]`.
- **New scored rule `versioning/changelog-present` — 9th sub-axis (Track #131).** Checks whether the design system ships a version-structured changelog (`CHANGELOG.md`/`HISTORY.md`/`CHANGES.md` with `## [1.2.3]` / `## v1.2.3` / `## 1.2.3` headings); emits one `warning` at repo level when absent or unstructured. Reports under the **ai-surface** axis — it's part of the AI-consumable contract (an agent editing against the DS needs change/breaking-change info). Calibrated via the recall suite (36 violation + 35 compliant fixtures → recall Wilson LB **0.9036**, precision **0.9011**) and promoted to `stable` + `contributesToScore`. `scoring-v1` now counts **9** sub-axes (was 8); coverage area J (Versioning) 0% → 25%. It fires on `fixtures/full-ds` (no CHANGELOG) and is counted there once `explain --score` audits the fixture (see the cwd fix above).

- **`lyse explain --score` reports the AI-Governance Maturity Level (Track #72/#155).** The output now includes a line — e.g. `AI-Governance Maturity: L3 — AI as an interaction pattern (marker component, interaction affordances)` — surfacing the deterministic maturity level (L0–L3) and which affordances were detected, alongside the Health Score. `--static-only` keeps it deterministic/byte-stable (L0–L3). On the non-static path (like the precision filter), the semantic LLM tier runs: `gatherAiContext` collects AI-relevant lines, the grounded judge supplies evidence-backed signals, and the level can lift to L4–L5 — marked `· LLM-derived`. Live example — AWS Cloudscape: deterministic L0 → `AI-Governance Maturity: L4 … · LLM-derived`. Lyse's mapping always computes the level (the judge supplies signals, not a level). The connector is injectable for tests.

- **LLM maturity judge — semantic tier of the AI-Governance Maturity Level (`llm/governance-maturity-judge.ts`, Track #72/#155).** Where deterministic detection fails — a DS whose AI affordances are *semantic* (e.g. AWS Cloudscape's generative-AI label tokens, with no name-detectable marker component) — Claude reads the AI-relevant context and reports the four objective **signals** (reserved tokens / marker / interaction / governance affordances) with confidence + a cited evidence string. **Honesty guard:** the judge reports *signals*, never a Kavcic level — the level stays Lyse's own `computeGovernanceMaturityLevel` mapping, so the #72 correlation stays an independent external-validity test rather than Claude reproducing Kavcic's rubric (which would be circular). Fail-safe to null (connector error / parse error / missing booleans / empty evidence). Validated on real Cloudscape: deterministic L0 → LLM-merged **L3 = Kavcic L3 exact** (confidence 0.91, evidence `color-text-label-gen-ai`). Shared LLM helpers extracted to `llm/llm-utils.ts` (the third LLM stage, per the long-standing note).

- **AI-Governance Maturity Level (`reliability/governance-maturity.ts` + `governance-signals.ts`, Track #72/Phase D).** A positive 0–5 maturity signal mapped to Kavcic's published AI-readiness ladder (L0 no AI layer → L4 governance layer; L5 not statically detectable). Measured by *presence* of affordances, not penalty — resolving the orientation flaw the #72 probe exposed (the penalty score ranked AI-mature DSs *below* no-AI ones). A no-AI DS is correctly L0 (Kavcic's own floor), not rewarded. Reported alongside the Health Score, not folded into it. `extractGovernanceSignals` reuses the governance rules' presence detectors for L0–L3 (reserved tokens → L1, marker component → L2, interaction affordances — loading/error, feedback, live-region — → L3). On the public Kavcic anchor (n=10) the maturity level lifts external-validity correlation from *undefined* (flat penalty score) to **Spearman ρ 0.65** — 9 of 10 exact (Carbon L2, Polaris L1, all 7 L0 systems); the single miss is AWS Cloudscape, whose AI maturity is semantic (no name-detectable marker), marking the deterministic-tier ceiling and the case for the LLM conformal tier. Design: `docs/superpowers/specs/2026-06-14-ai-governance-maturity-level-design.md`.

- **`spearmanRho` rank-correlation utility (`reliability/correlation.ts`, Track #72).** Tie-safe Spearman's ρ (rank-then-Pearson, not the no-ties shortcut), the external-validity release-gate statistic for correlating Lyse's scores against an independent ordinal anchor (e.g. published human AI-readiness levels). Returns `NaN` for n < 2 or a constant series; throws on length mismatch. 8 unit tests.

- **New rule `tokens/theme-modes-present` (experimental, Track #127).** Detects whether a design system defines light/dark theme modes by scanning for any of: a `prefers-color-scheme` media query, a `[data-theme]`/`[data-mode]`/`[data-color-mode]` attribute selector, a `.dark`/`.light` class convention, a DTCG token file with a `dark`/`light` group or `$extensions` mode split, or a Tailwind v4 `@variant dark` / `dark:` indicator. Emits one `warning` at repo level when no signal is found; emits nothing when present. Registered as `contributesToScore: false` + `deterministicValidator: true` — will promote to the trusted score after calibration.

- **Two more deterministic validators promoted to the trusted score (Phase A).** `ai-surface/ds-index-exported` (DS package exports a discoverable index ≥3 named exports) and `ai-surface/agent-instruction-files` (ships Cursor rules / Claude skills with valid frontmatter) are now `stable` + `contributesToScore`. Both are pure file-presence / schema checks — the same `deterministicValidator` bar as the existing 5 — so their synthetic-suite precision (Wilson LB 0.90) is a valid calibration source (no real-world context gap). The `scoring-v1` trusted path now counts **7** sub-axes (was 5); `fixtures/full-ds` Health Score 91 (within the pinned [90,96] band). The remaining experimental ai-surface / ai-governance rules stay reported-only pending real-repo recall validation (name-pattern detection) or the LLM judgement layer (semantic).

### Fixed

- **SCSS scanning for AI tokens (`ai-governance/ai-tokens-reserved`).** `detectReservedAiTokens` scanned only `**/*.css`, missing `.scss` token declarations (e.g. Carbon Design System's `--cds-ai-aura-*` / `ai-gradient` tokens live in `.scss` source). SCSS files are now scanned via the existing `transformScssToCss` line-preserving transform before `extractCssCustomPropertyNames`, so SCSS-only constructs (`$vars`, `@mixin`) are neutralised cleanly. The `isReservedTokenName` precision guard (bare `ai` requires an AI-distinctive descriptor) applies unchanged on the SCSS path — Mantine-style `--ai-bg`/`--ai-size` remain undetected. (Track #71 / #139)

- **AI-token detection precision (`ai-governance/*`).** `isReservedTokenName` flagged any token with a bare `ai` segment, so Mantine's `--ai-size-*` / `--ai-bg` / `--ai-color` (where `ai` abbreviates *ActionIcon*) false-fired — cascading false positives into `ai-tokens-reserved`, `ai-marker-component-present`, `ai-token-requires-marker`, and `value-gate-doc-present` on a non-AI design system (found by the Track #71 real-DS validation). A bare `ai` segment is irreducibly ambiguous by name, so it now counts only when corroborated by an AI-distinctive descriptor (`aura`, `gradient`, `sparkle`, `glow`, `generative`, `generated`) or an unambiguous vendor signature (`dragon-fruit`, `magic`, `genai`/`gen-ai`). The trade is recall on generically-named `--ai-*` AI tokens (under-count) — the safe direction vs. penalising a non-AI DS. Verified: the Mantine false positive is gone; suite green. (#139)

- **Spacing precision: comments + multi-line declarations.** `tokens/no-hardcoded-spacing` did not skip values inside comments (the comment guard was color-only) and lost CSS property context on continuation lines (a `box-shadow` offset like `13px -13px` on a wrapped line was flagged as spacing). Now: the shared `isInCommentOrUrl` guard is applied to spacing too, and `isNotSpacingPropertyContext` walks the property lookup across newlines (stopping only at `; { }`), so a continuation line resolves its real declaration property. Together with the custom-property fix, this took agreement-with-stylelint precision on the primer-css spacing corpus to **0.90** (from 0.29), recall preserved. (#120)

- **Custom-property definitions are no longer flagged as drift (precision).** `tokens/no-hardcoded-color` and `tokens/no-hardcoded-spacing` treated a hardcoded value on the RHS of a `--x: <value>` custom-property declaration as drift only outside token-definition selectors (the Track 9.11 narrowing). The #120 cross-tool calibration showed this produced hundreds of false positives on real design systems — a value in a custom-property declaration is structurally a *token definition* in any scope (e.g. `--heatmap-level-1: rgba(...)` in a chart module). `isCssCustomPropertyDeclaration` now skips any `--x:` RHS regardless of selector. Net effect on the mantine corpus: spacing findings 731→229, agreement-with-stylelint precision 0.21→0.67, recall preserved. The "this `--x` should reference an existing token" case is semantic and left to the LLM filter.

- **SCSS line-number attribution (correctness).** `transformScssToCss` used to remove `$variable` declarations and SCSS-only at-rules (`@mixin`, `@include`, `@if`, `@for`, `@use`, `@import`, …) from the postcss AST and re-stringify, which collapsed lines and shifted every finding below by the number of removed lines. On `.scss` sources, `tokens/no-hardcoded-color` / `tokens/no-hardcoded-spacing` therefore reported the wrong line (and could miss or mislabel declarations when offsets compounded) — corrupting `lyse fix` edit targets and SARIF locations. The transform is now **line-count preserving**: SCSS-only constructs are blanked in place, `//` comments are converted to block comments in place (URL-safe), and `#{$var}` interpolation is resolved without reflowing. Plain CSS was unaffected and remains so. Surfaced by the Track #120 cross-tool agreement experiment.

### Added

- **`LYSE_SKIP_LAYER4_AUGMENTATION` env guard (Track #115 Lot 3b).** When set to `1`, Layer-4 LLM *augmentation* (the governance grader) is skipped while the precision *filter* still runs. Used by the filtered-precision calibration harness (one `claude` call per file instead of two) and available to CI/perf runs that want the filter without the slower grader. Does not affect `--static-only` (which skips both).

- **Tiered-scoring mechanism (Track #115 Lot 3a).** New `contributesToScoreWhenFiltered?: boolean` field on `SubAxisRecord` and a pure resolver `resolveStableSubAxes(subAxes, { filterRan })` (`src/reliability/score/stable-sub-axes.ts`). A sub-axis counts toward the `scoring-v1` trusted score if it is a calibrated stable contributor OR — when the LLM precision filter ran this audit (`meta.layer4.filterRan === true`) — a filter-gated contributor. `explain --score` now reads `filterRan` from the pipeline result and resolves the contributing set through this helper. Ships **inert**: no real sub-axis sets `contributesToScoreWhenFiltered` yet (a catalogue-invariant test enforces this), so scores are unchanged on every path until calibration (Lot 3b) proves under-filter precision LB ≥0.90 for `tokens.color` / `tokens.spacing` and flips the flag. Respects the "never ship an unvalidated signal" principle.

- **agent-cli connector (Track #115 Lot 1).** Run the LLM layer on the user's Claude Code subscription — no API key required. The new `AgentCliAdapter` spawns `claude --print --model <m> --output-format json` with the user prompt on stdin, parses `.result` / `.total_cost_usd` / `.is_error` from JSON stdout, and implements `ConnectorClient`. `isAgentCliAvailable()` checks PATH via `claude --version`. Default-ON: when no provider is configured and `claude` is on PATH, `resolveConnector` automatically selects the agent-cli backend (gated behind `agentCliAvailable()` so CI without `claude` stays Noop). Explicit `provider: none`, `--static-only`, or any other explicit provider all win over the auto-default. Config: `llm.provider: agent-cli` or `llm.connector: agent-cli`; env overrides `LYSE_AGENT_CLI_TIMEOUT_MS` (default 180000) and `LYSE_AGENT_CLI_BINARY` (default `claude`). `spawnFn` is injectable for unit tests — no real CLI spawn in the test suite.

- **LLM precision filter (Track #115 Lot 2).** New `runFilterStage` (`src/llm/filter-stage.ts`), wired into the audit pipeline after inline suppression and before Layer 4. For `tokens/no-hardcoded-color` and `tokens/no-hardcoded-spacing` findings only, it batches each file's candidates plus the full source to the LLM connector and asks keep/drop per finding, dropping semantic false positives (chart palettes, icon fills, embed-theme config). Default-ON when a connector resolves (e.g. auto-selected agent-cli); degrades to a pure pass-through when the connector is Noop / budget-exhausted (empty response → bail) so the deterministic static floor is preserved byte-for-byte. The stage only ever DROPS findings, never adds, and fails safe to KEEP on every uncertainty path (missing source, oversized file >60 KB, parse error, out-of-range verdict). Surfaces `filterRan` + `filteredCount` in `Layer4Meta`. Test determinism: a new `LYSE_DISABLE_AGENT_AUTODETECT=1` guard (set by the vitest setup file) prevents the suite from auto-spawning the real `claude` CLI, and the Track 8.10 score smoke now passes `--static-only`.

- **Score regression gate (Track 8.10).** New CLI smoke test (`tests/cli.score-smoke.test.ts`) pins the First Trusted Score output of `lyse explain --score fixtures/full-ds`: Health Score band [90, 96], scoring path `scoring-v1`, and Counted findings band [2, 4]. Guards against `stableSubAxes` silently going empty (which would trivially return 100) and against silent scoring-path regressions.

### Added

- **First Trusted Score — Track 8.8 LOT B.** 5 deterministic validator sub-axes promoted to `status: "stable"` + `contributesToScore: true`, calibrated via the synthetic recall suite (Wilson 95 % lower bound ≥ 0.90 on both precision and recall): `tokens.dtcg-conformance` (`tokens/dtcg-conformance`), `ai-surface.component-manifest-json` (`ai-surface/component-manifest-json`), `ai-surface.llms-txt-structure` (`ai-surface/llms-txt-structure`), `ai-surface.mcp-config-present` (`ai-surface/mcp-config-present`), `ai-surface.shadcn-registry-valid` (`ai-surface/shadcn-registry-valid`). Findings from these rules now count in the `scoring-v1` Health Score path (`lyse explain --score`). The `deterministicValidator: true` field marks each as a pure file-presence / JSON-schema / grammar rule where synthetic precision is a valid calibration source. All heuristic rules (`tokens/no-hardcoded-color`, `tokens/no-hardcoded-spacing`, `ai-surface/agent-instruction-files`, etc.) remain experimental.

### Changed

- **`tokens/no-hardcoded-color` — Track 9.11 second pass (static precision ceiling).** Builds on the first pass (test/story/fixture/schema/example guards). New guards: (D) color token-definition files (`colors.ts`, `*-colors.ts`, `_legacy-colors.ts`, `palette.ts`, `*.colors.ts/css`, etc.) are skipped — a hex there is the source of truth, not drift; (E) `demos/**` directories and `*.demo.*` files are skipped; (F) CSS/SCSS files under `stories/` directories are skipped (the previous guard only covered `*.stories.tsx`, not `stories/button.module.css`); (G) `isCssCustomPropertyDeclaration` narrowed to only skip in token-definition selector scopes (`:root`, `html`, `:host`, `*`, `[data-theme…]`, `@theme`, `@layer base`) — a `--local: #hex` inside a `.widget { }` component rule now correctly fires as drift. `fixtures/full-ds` Health Score: 20 (stable).
- **`tokens/no-hardcoded-spacing` — Track 9.11 property-awareness (correctness bug).** The rule previously fired on ANY px/rem/em regardless of CSS property. Now property-aware: only fires when the value is in a CSS spacing property (`margin*`, `padding*`, `gap`, `row-gap`, `column-gap`, `top`, `right`, `bottom`, `left`, `inset*`) or a spacing Tailwind arbitrary-value prefix (`p-`, `px-`, `m-`, `mx-`, `gap-`, `space-x-`, `inset-`, `top-`, etc.). Non-spacing properties are skipped: `font-size`, `line-height`, `border-radius`, `width`, `height`, transform functions, `@media` queries, `useMediaQuery` / `matchMedia` calls, `w-[…]`, `h-[…]`, `text-[…]`, `leading-[…]`, `rounded-[…]`, `translate-[…]`. Additionally, `1px` is no longer globally allowlisted — it is now allowed only in non-spacing contexts (border-width); `padding: 1px` / `p-[1px]` correctly fire as drift. `fixtures/full-ds` Health Score: 20 (stable).

### Added

- **i18n foundation (Track 9.1).** New optional `i18n` block in `.lyse.yaml`
  (`locales` to pick built-in language packs, `vocabulary` to add custom
  terms per domain) and a shared locale-keyed vocabulary module
  (`vocabularyFor`, `makeLocaleMatcher`, `aiNounAlternation`) covering
  en/fr/de/ja/es for AI nouns, disclaimer phrases, control labels, gate
  phrases, and loading phrases. Consumed by the AI-marker gate and the
  governance rules below.
- **End-to-end i18n fixtures (Track 9.1).** New `fixtures/i18n-fr-ds`
  (`BadgeIA` marker, FR disclaimer, `Régénérer` control, FR
  `AI_GOVERNANCE.md`) and `fixtures/i18n-de-ds` (`KIBadge`, `KI-generiert`,
  `Neu generieren`), audited through the CLI pipeline in
  `tests/cli.i18n-ds.test.ts`: a non-English DS now activates the
  AI-governance axis end-to-end, and narrowing `i18n.locales` to `["en"]`
  drops the localized detection. `fixtures/full-ds` Health Score is
  unchanged vs `main` (20, byte-identical findings).

### Changed

- **`ai-governance/disclaimer-present` is locale-aware (Track 9.1).**
  Language-agnostic structural signals are now primary: a `role="note"`
  element or a `data-ai-disclaimer` / `data-disclaimer` attribute inside an
  AI-marker file counts as a disclaimer. Disclaimer copy is matched against
  the locale-keyed `disclaimerPhrases` vocabulary (en/fr/de/ja/es) instead
  of English-only regexes, so e.g. "Généré par l'IA, peut être inexact" no
  longer triggers a false warning. The GitLab Pajamas canonical-wording
  signal and the `*Disclaimer*` tag-name detector are unchanged.
- **`ai-governance/human-control-affordances` is locale-aware (Track 9.1).**
  Two new language-agnostic per-output signals: JSX handler props
  (`onRegenerate`, `onRetry`, `onStop`, `onUndo`, `onAccept`, `onReject`,
  `onDismiss`, `onReport`) and `data-action="regenerate|retry|stop|undo|
  accept|reject|dismiss|report"` attributes. Button labels are now matched
  against the locale-keyed `controlLabels` vocabulary (en/fr/de/ja/es), so
  `Régénérer`, `Neu generieren`, or `再生成` earn the same credit as
  `Regenerate`. Identifier-name detection (primary) is unchanged.
- **`ai-governance/value-gate-doc-present` is locale-aware (Track 9.1).**
  Discovered gate docs are now validated by language-agnostic structure
  first — a markdown checklist (`- [ ]` / `- [x]`) or the YAML front-matter
  key `lyse-doc: value-gate` — and gate phrasing is matched against the
  locale-keyed `gatePhrases` vocabulary (en/fr/de/ja/es) instead of
  English-only regexes, so "L'IA est-elle nécessaire ?" counts. Filename
  discovery is unchanged; a doc with neither structure nor gate language
  still warns.
- **Localized AI-marker detection (Track 9.1).** The shared `isAiMarkerName`
  predicate (gate for all 7 ai-governance rules) now also recognizes
  identifiers combining a structural marker word (`label`, `badge`, `tag`,
  `indicator`, `marker`, `avatar`, `chip`, `pill`) with an AI noun from any
  active locale — e.g. `BadgeIA`, `IALabel`, `KIBadge`, `人工知能Badge` — so
  non-English design systems open the AI-governance gate. Latin nouns are
  boundary-delimited so `ai` never matches inside `Email`/`Detail`/`Caption`.
- **`ai-governance/ai-marker-anti-patterns` is locale-aware (Track 9.1).**
  The sparkle-only escape now accepts localized disclaimers and standalone
  AI nouns (e.g. a sparkle paired with "Généré par IA" is no longer a false
  positive), and the AI-as-CTA-label detector flags `IA`/`KI`/`人工知能`
  button labels, not just English `AI`.
- **MCP `audit_file` runs the full single-file rule set (Track 13.1).**
  Added a registry-driven `singleFileCapable` flag to the `Rule` interface;
  `audit_file` now filters `ruleObjects` by it instead of importing a
  hardcoded list. Six rules run in single-file mode —
  `tokens/no-hardcoded-color`, `tokens/no-hardcoded-spacing`,
  `components/no-native-shadows`, `a11y/essentials`,
  `naming/component-pascalcase`, and `naming/hook-prefix` (the two naming
  rules are new in this mode). Repo-wide rules (AI-governance, AI-surface,
  `stories/coverage`) need the full project graph and remain
  `lyse audit`-only; they will be exposed to agents via MCP resources in a
  later track.
- **`ai-governance/human-control-affordances`** now detects three more
  controls from the canonical AI-interaction guidance: `Report`,
  `Revert to AI`, and `Use suggestion` (component names and button
  labels).
- **`ai-governance/disclaimer-present`** now recognises `AI-assisted`,
  the literal `Uses AI. Verify results.`, and `verify results` /
  `verify the output` phrasings, without widening false positives on
  generic non-AI disclaimers (co-location with an AI marker still
  required).

### Fixed

- **CI:** the required `perf` check now runs on every PR and skip-succeeds
  when `packages/core/**` is untouched, instead of being path-filtered.
  Previously, docs-only PRs were blocked indefinitely on a `perf` status
  that never reported.


## [0.2.0-alpha.1] — 2026-06-09

This release adds the **AI-Governance axis** (11 new rules under a new
scoring axis), the **LLM Layer 4** augmentation pipeline (connector
resolver + grader stage + hallucination validator), and **`lyse add
ci-gate`** — a new CLI command that installs the Lyse score-regression
CI gate into any repo with one command.

### Added

- **`lyse add ci-gate`** — new CLI command that installs the Lyse
  score-regression CI gate into any repo. Drops
  `.github/workflows/lyse.yml` (audits PR + main, posts a markdown
  comment, fails on regression) and `.github/scripts/lyse-gate.mjs` (the
  comparator). Supports `--threshold=N` (max allowed score drop, default
  `0`), `--lyse-version=<v>` (pin the CLI version the workflow uses,
  default `alpha`), and `--force` (overwrite existing files). Templates
  are inlined in the command file so they survive the npm publish
  pipeline. Workflow handles fork PRs (skips the comment, read-only
  GITHUB_TOKEN), unbuildable `main` (gate skipped, baseline-unavailable
  comment posted instead of failing every PR), and concurrent pushes
  (`concurrency:` group cancels stale runs). Validated end-to-end on
  `lyse-labs/lyse-playground`.
- **LLM connector resolver** (`packages/core/src/llm/connectors/`): `resolveConnector(config, flags, opts)` factory that routes audit runs to a uniform `ConnectorClient` interface or degrades to a no-op. Ships four implementations:
  - `NoopAdapter` — safe default for `--static-only`, `provider: none`, unconfigured, or over-budget paths (zero cost, zero network).
  - `OpenAICompatibleAdapter` — covers OpenAI, OpenRouter, and Ollama via a configurable `baseURL` and injectable `fetchFn` (no real network calls in tests).
  - `AnthropicAdapter` — Anthropic `direct-api-key` via `@anthropic-ai/sdk` with injectable `fetch` option; default model `claude-sonnet-4-6`.
  - `mcp-host` stub — throws `ConnectorNotImplementedError` so Track 4.2 can detect and degrade gracefully.
  - `ResponseCache` — deterministic SHA-256 disk cache at `~/.cache/lyse/llm-responses/`, keyed on `{ model, messages }`, honoring `cacheMaxAgeDays`; cache hit sets `usdSpent: 0`.
  - `LLMBudget` wiring — `canSpend` pre-check + `record` post-call; over-budget calls return no-op result without throwing. API keys read from env only; no secrets logged. (Track 4.1 — closes lyse-labs/lyse-internal#54.)
- **Layer 4 grader stage** (`packages/core/src/llm/layer4-stage.ts`): replaces the stub with a real LLM-powered augmentation pass. Resolves the Track 4.1 connector, builds a governance prompt from rubric dimensions, calls the LLM, and validates evidence. Ships with:
  - `validateProposedFindings()` (`validator.ts`) — drops LLM-proposed findings whose cited file does not exist or whose snippet is not found in the file; path traversal attempts (`../../`) are also dropped. Count of dropped findings goes into `Layer4Meta.droppedHallucinations`.
  - `RubricDimension` interface + empty stub (`rubric-stub.ts`) — Track 4.3 fills the real rubric.
  - Graceful degradation: connector throws → `meta.error` set, audit continues with static score. Empty connector response (noop / over-budget) → empty `meta` with no augmented findings. `--static-only` / `config.llm.staticOnly` → `meta.staticOnly: true`.
  - `Layer4StageOptions.connector` and `.rubricDimensions` injection points for deterministic tests (zero real network calls). (Track 4.2 — closes lyse-labs/lyse-internal#55.)

### Fixed

- **`lyse add ci-gate` — 3 critical bugs from code review**:
  - `--lyse-version=""` (empty string) was silently accepted and produced a
    broken `LYSE_VERSION: ""` in the generated workflow, causing
    `npx --yes @lyse-labs/lyse@` to fail in CI. Empty values are now
    rejected with a clear error, and values are validated against
    `/^[\w.-]+$/` to reject shell-metacharacter injection (defense in
    depth — the workflow already double-quotes the value).
  - Default `lyseVersion` was the moving dist-tag `"alpha"`, which
    contradicted the workflow's own comment warning against moving tags
    (the gate runs `lyse audit` twice and a tag that moves between calls
    produces non-comparable reports). The default is now the version of
    the CLI running the command (`VERSION` from `../index.js`), pinning
    both audits to the same scorer + rule set.
  - `lyse add ci-gate /etc` (or `~`) would silently write
    `.github/workflows/lyse.yml` into any directory. Now refuses to write
    if `cwd` contains neither `.git/` nor `package.json` and surfaces a
    clear error pointing at the new `--force-not-a-repo` flag to bypass
    the check intentionally.
- `ai-governance/ai-marker-anti-patterns` (Track 3.4): sparkle check now gated on AI context — `detectSparkleOnlyMarker` is only evaluated when the source file has an AI-marker name (exported component or JSX tag matching the AI-marker vocabulary). A decorative `✨` in a `HeroBanner` or marketing component with no AI context no longer triggers a false warning. Anti-pattern B (`"AI"` in CTA labels) is unchanged and always evaluated. Regression test: `HeroBanner.tsx` with `<div>✨ Welcome!</div>` → 0 findings.
- `ai-governance/disclaimer-present` (Track 3.9): `*Disclaimer*` tag match narrowed to AI-specific disclaimers — `CookieDisclaimer`, `LegalDisclaimer`, and `PrivacyDisclaimer` co-located with an AI marker no longer falsely earn `info` credit. Only components whose name starts with `ai`, `genai`, `generative`, or `llm`, or the bare name `Disclaimer`, are counted as AI disclaimers. Disclaimer-text phrase matching is unchanged. Regression tests: `AIBadge + CookieDisclaimer` → `warning`; `AILabel + LegalDisclaimer` → `warning`.
- `ai-governance/human-control-affordances` (Track 3.6): removed `"edit"` from `PER_OUTPUT_LABELS` — a generic `<button>Edit</button>` (e.g. an inline form field editor) is too common to reliably signal an AI-output correction control. Compound `EditResponse`/`EditOutput` exported names remain credited via `PER_OUTPUT_NAME_PATTERNS`. Regression test: AI-marker file with only `<button>Edit</button>` → `warning`.
- `ai-governance/value-gate-doc-present` (Track 3.11): `fg.sync` IGNORE list for doc discovery was missing `**/.next/**`, `**/out/**`, and `**/coverage/**` — the rule could scan generated directories. Updated to the full 7-entry list matching `parsers/ai-tokens.ts` and sibling rules.
- `types.ts`: all 11 `ai-governance/*` rule IDs added to `BuiltInRuleId` union for type-safety and autocomplete (`RuleId = BuiltInRuleId | string` so this is purely additive).
- `ai-governance/explainability-affordance` (Track 3.5): affordance detection now requires AI co-location — only affordance components found in the **same file** as an AI-marker identifier are credited. A generic `ConfidenceDisplay` (health metric) or `SourcesPanel` (search results) in a file with no AI marker no longer earns `info`. Removes false-positive "governed" signals that arose from name-matching across unrelated files.

### Documentation

- Added a **Limitations** section to `docs/rules/ai-governance-explainability-affordance.md` and `docs/rules/ai-governance-human-control-affordances.md` noting that detection is static + name/co-location based; behavioral verification (affordance wired to AI output at every render site) is deferred to Track 4.
### Changed

- **Track 3 DRY + perf refactor (internal, no behavior change):** consolidated 11 duplicate `isAllowlisted` functions, `COMPONENT_GLOB`, `SCAN_IGNORE`, `fileHasAiMarker`, `deriveComponentNameFromPath`, and `safeReadText` copies into the shared hub `ai-governance-ai-marker-component-present`. Added `makeAllowlistCheck` factory. `feedback-control-present` and `explainability-affordance` now glob the component tree once per `evaluate` call instead of twice. Removed redundant `findings.sort()` in `ai-loading-error-states` and `disclaimer-present` (rule-runner re-sorts globally). No change to rule outputs, findings content, or test assertions. Refs lyse-labs/lyse-internal#15.

- `ai-governance/disclaimer-present` and `ai-governance/ai-content-live-region`: the
  `warning` path now emits a single **aggregate** repo-level finding that lists all
  affected files (first 20, then "+N more"), instead of one warning per non-compliant
  file. On a design system with N AI-surface files, each rule now emits at most 1
  warning (was O(N)). `info` findings (compliant files) remain per-file.
  Follow-up to lyse-labs/lyse-internal#15.

### Removed

- `create-lyse` package (the unscoped `npm create lyse@latest` wrapper).
  Lyse is a drift scanner for existing projects, not a project scaffolder
  — the `create-*` convention is for project starters (Vite, Next, React).
  Users should run `npx @lyse-labs/lyse init` instead, which matches the
  install flow of comparable scanner/linter tools (ESLint, Prettier,
  Biome, Knip). The `packages/create/` workspace has been removed and
  both published versions (`0.1.0-alpha.2`, `0.1.0-alpha.3`) have been
  unpublished from npm.

### Fixed
- `ai-governance/ai-marker-anti-patterns`: `fg.sync` ignore list was missing `**/.git/**`, `**/.next/**`, `**/out/**`, `**/coverage/**` — the rule could scan generated/VCS directories. Updated to match the canonical 7-entry ignore list used by sibling rules (`ai-content-live-region`, `parsers/ai-tokens.ts`).
- `docs/rules/ai-governance-ai-content-live-region.md`: "How it works" described a plain same-file co-existence check; the implementation actually requires proximity (`isLiveRegionProximate`). Updated to accurately describe the return-block proximity requirement.
- `docs/rules/ai-governance-explainability-affordance.md`: Allowlist section falsely claimed "does not yet support a per-repo disable directive." The rule has a wired `lyse-disable` allowlist. Replaced with the correct `lyse-disable` directive and use-when guidance matching sibling docs.
- `packages/core/src/reliability/catalogue/sub-axes.ts`: header comment listed 5 axes, omitting `ai-governance` (the 6th). Updated to list all 6.
- Reverted erroneous `stable` promotion of 3 AI-Consumable sub-axes (`agents-md-quality`, `component-manifest-json`, `ds-index-exported`). They were promoted without calibration evidence (all measurement fields were `null`), which directly contradicted the public falsifiable claim in `docs/architecture/reliability.md` that the promotion gate requires N≥30 + Wilson 95% LB ≥0.90 on recall. Until the Bench corpus runs and populates the 5 measurement fields, all 17 sub-axes ship as `experimental`.
- Bumped stale `12 sub-axes` references in `reliability.md` and `health-score.md` to the actual count (17).
- Regenerated `rules-manifest.json` and `docs/architecture/sub-axes.md` from rule metadata (single source of truth).
- Added test invariant: any sub-axis with `status: stable` MUST have non-null `recallWilsonLowerBound \geq 0.9` and non-null `lastCalibrated` (enforces the promotion gate at code level so future violations fail CI).

### Added

- `ai-governance/value-gate-doc-present` (Track 3.11): detects whether a DS with an AI surface (AI-marker component or reserved AI tokens) documents a structured go/no-go AI value-gate (ServiceNow "10-Q" pattern). Emits `warning` when absent or lacking gate language; emits `info` when a valid gate doc is present. Reuses `scanForMarkerComponents` (3.2) and `detectReservedAiTokens` (3.1) for surface detection. Allowlist via `lyse-disable ai-governance/value-gate-doc-present`. Closes lyse-labs/lyse-internal#47.

- `ai-governance/ai-content-live-region` (Track 3.10): warns when an AI-output or
  streaming component (`AI_MARKER_NAMES`, `*AIResponse*`, `*ChatMessage*`, `isStreaming`,
  `isGenerating`) is present without an ARIA live region (`aria-live="polite|assertive"`,
  `role="status|alert"`, PatternFly `isLiveRegion`); emits info when a live region is
  detected. Allowlist via `lyse-disable ai-governance/ai-content-live-region`.

- `ai-governance/ai-loading-error-states` (Track 3.7): warns when an AI marker surface exists but lacks a named loading state with paired text (bare spinners fail) or an AI-specific error state component; emits `info` when both are present. Recovery-flow detection deferred to Track 4. Allowlist via `lyse-disable ai-governance/ai-loading-error-states`. Closes lyse-labs/lyse-internal#43.
- `ai-governance/disclaimer-present` (Track 3.9): detects AI disclaimer text or component co-located with an AI-marker component. Emits `warning` when a marker is present but no disclaimer is found; `info` when a disclaimer is detected (with a note for the GitLab Pajamas canonical wording). Allowlist: `lyse-disable ai-governance/disclaimer-present`. Guidelines: HAX G1/G2, GitLab Pajamas. Closes lyse-labs/lyse-internal#45.
- `ai-governance/feedback-control-present` (Track 3.8): detects a feedback control (thumbs, rating, vote, helpful) on AI output; notes categorized reason enum; cross-condition warning when AI-marker present but no feedback control found (HAX G15 / PAIR Feedback). Allowlist: `lyse-disable ai-governance/feedback-control-present`. Closes lyse-labs/lyse-internal#44.

- `ai-governance/human-control-affordances` (Track 3.6): detects per-output control affordances
  (Regenerate/Retry/Stop/Edit/Undo/Confirm/Dismiss/Accept/Reject) and global AI disable toggle.
  Warns when an AI marker surface exists but no correction/dismissal controls are shipped (HAX G8 / G9).
  Allowlist: `lyse-disable ai-governance/human-control-affordances`.
- `ai-governance/ai-marker-anti-patterns` rule — Track 3.4 (Face B).
  Lints two forbidden AI-marking anti-patterns in component files (`**/*.{tsx,jsx,vue}`).
  Anti-pattern A (SAP Fiori XAI): a sparkle signal (`✨` literal, `Sparkle`/`Sparkles`/`SparkleIcon`
  import, or `icon="sparkle*"` prop) used as the sole AI marker with no accompanying text label
  or AI-marker component — icon-only marking fails accessibility and is semantically ambiguous.
  Anti-pattern B (GitLab Pajamas): the standalone case-sensitive token `AI` used as the primary
  action label of a `<button>`, `<Button>`, or `<a>` element — `AI` is a noun, not an action verb.
  Both detectors emit `warning`. A sparkle accompanied by a text marker or AI-marker component
  (`AILabel`, `AIBadge`, `magic-*`, etc.) is not flagged; `AI` in non-CTA elements (headings,
  paragraphs) is not flagged. Reuses `isAiMarkerName` and `safeReadText` from
  `ai-governance/ai-marker-component-present`. Allowlist via
  `lyse-disable ai-governance/ai-marker-anti-patterns` in an adjacent README or `.lyse.yaml`.
- `ai-governance/explainability-affordance` rule — Track 3.5 (Face B).
  Detects whether the DS ships a companion explainability affordance alongside an
  AI-marker component. Name-based detection covers components whose exported
  identifier or file name contains `Explain`, `Explainability`, `WhyThis`,
  `Citation`, `Sources`, `Confidence`, or `Provenance` (case-insensitive).
  Popover/tooltip ARIA detection covers AI-marker components that carry
  `aria-describedby` or `role="dialog"` / `role="tooltip"`. Emits `info` when
  an affordance is found; emits `warning` (cross-condition) when an AI-marker is
  present but no affordance is detected; emits nothing when the DS has no AI
  surface. Reuses `AI_MARKER_NAMES` from `ai-governance/ai-marker-component-present`.
  Guidelines: HAX G11 / PAIR Explainability. Behavioral slice (indicator wherever
  AI output appears) deferred to Track 4.
- `ai-governance/ai-token-requires-marker` rule — Track 3.3 (Face B). Carbon mandatory composite: each component file that references a reserved AI token (`var(--ai-*)`, `--p-color-*-magic*`, `color.ai.*`, `dragon-fruit`, etc.) must render an AI-marker component (AILabel, AIBadge, `magic-*` tag, etc.) or carry an explicit `data-ai` attribute. Missing marker = `error`. Detection is HIGH-confidence only when the token reference is an unambiguous `var(--…)` or bare `--token` form; dot-path heuristic hits are suppressed (LOW confidence). Fast-exit: rule is a no-op when `detectReservedAiTokens` finds zero reserved tokens. Imports `isReservedTokenName` directly from `parsers/ai-tokens.ts` (single source of truth — no local redefinition) and `AI_MARKER_NAMES` from `ai-governance/ai-marker-component-present`. Allowlist via `lyse-disable ai-governance/ai-token-requires-marker` in an adjacent README or `.lyse.yaml`.
- `ai-governance/ai-marker-component-present` rule — Track 3.2 (Face B).
  Detects whether the DS ships a dedicated AI-marker component (Carbon `AILabel`,
  generic `AIBadge` / `AITag` / `AIIndicator` / `AIAvatar`, `GenAI*` variants,
  `*AIMarker*`, Polaris `magic-*`). Scans the export surface (`src/index.ts`,
  `index.ts`, etc.) and component files (`**/*.{tsx,jsx,vue}`) by file name and
  exported identifier. Emits `info` when a marker component is found; emits
  `warning` (cross-condition) when reserved AI tokens exist (via the shared
  `detectReservedAiTokens` parser) but no marker component is detected; emits
  nothing when the DS has no AI surface. Exports `AI_MARKER_NAMES` for reuse by
  sibling rules (Track 3.3 / 3.5). Allowlist via
  `// lyse-disable ai-governance/ai-marker-component-present` in an adjacent
  README or `.lyse.yaml`.
- Registry count-assertion hardening — `registry.test.ts` and `sarif.test.ts`
  no longer hardcode the rule count (was `18`). `registry.test.ts` asserts
  `ruleMap.size === ruleObjects.length`; `sarif.test.ts` derives the expected
  count from `RULE_METADATA.length`. Future rule PRs do not need to touch these
  assertions.
- `ai-governance/ai-tokens-reserved` rule — first rule shipped under the
  `ai-governance` axis (Track 3 / Face B). Inventories reserved AI-marker
  design tokens (Carbon `dragon-fruit` / `*-ai-*`, Polaris `magic`, Workday
  Canvas `*-ai-*`, generic leading-`ai` segment) declared in `tokens.json`,
  `tokens/**/*.json`, `*.tokens.json`, and `**/*.css` `--*` custom
  properties. Severity is `info` — a DS with no AI surface emits no finding
  and is not penalised. The shared parser `detectReservedAiTokens(repoRoot)`
  (exported from `packages/core/src/parsers/ai-tokens.ts`) is reused by the
  downstream gating rule `ai-governance/ai-token-requires-marker` (Track
  3.3). Allowlist via `// lyse-disable ai-governance/ai-tokens-reserved` in
  an adjacent README or `.lyse.yaml`.
- **AI-Governance axis (Face B) plumbing** — added the `ai-governance` scoring
  axis (`AxisName`) and reliability sub-axis label (`AxisLabel`), the foundation
  for the AI-Governance signal family (Track 1 / roadmap §6). The axis is
  additive: `ai-surface` (Face A, AI-Consumable) is unchanged, so the 17 shipped
  rule IDs and the Health Score are untouched. An axis with no rules yet scores
  `N/A` and is excluded from the final average (score-neutral until governance
  rules ship). Locked by a scorer invariant test.
- `ai-surface/mcp-config-present` rule — detects whether a design system
  repository declares an MCP server (Model Context Protocol), signaling
  AI-Consumable readiness. Looks for `.mcp.json` (Claude Code),
  `.cursor/mcp.json` (Cursor), or `claude_desktop_config.json` at the repo
  root and validates each entry has a non-empty key and a `command` string.
  Warning when no config is found; error when present-but-malformed.
  Allowlist via `// lyse-disable ai-surface/mcp-config-present` in the repo
  root README.
- `ai-surface/llms-txt-structure` rule — detects whether the repo ships a
  valid `llms.txt` at its root per the [llmstxt.org](https://llmstxt.org/)
  spec: H1 title, blockquote summary, and at least one `## <section>`
  heading whose list items follow `- [<title>](<url>): <description>`.
  Absence emits a single warning; malformed files emit errors per
  structural issue. Companion `llms-full.txt` is recognised as a bonus
  signal. Allowlist via `lyse-disable ai-surface/llms-txt-structure` in
  the root README.
- `components/contracts-strictness` rule — detects lax component-prop
  contracts that hinder AI-agent code generation:
  - **error** — prop typed `any` / `unknown`.
  - **warning** — variant-like prop (`variant`, `size`, `intent`, `color`,
    `tone`, `appearance`, `kind`) typed plain `string` instead of a
    string-literal union.
  - **warning** — publishable `package.json` missing `types` / `typings`
    or pointing to a non-existent file.

  Framework-allowed props (`children`, `ref`, `key`, `as`, `asChild`) and
  private (`"private": true`) packages are skipped. The variant heuristic
  excludes `type` (overwhelmingly an HTML passthrough, not a DS variant).
- `ai-surface/shadcn-registry-valid` rule — detects whether the design
  system ships a valid shadcn-style component registry (the canonical
  AI-Consumable surface understood by the shadcn CLI and most coding
  agents today). Validates the minimal shadcn schema (`name`, `type`,
  `files`) at canonical locations (`registry.json`,
  `public/registry.json`, `registry/*.json`) with support for single-item
  and collection (`items[]` / `registry[]`) shapes. Warning when
  `components.json` exists but no registry is shipped; errors on
  malformed JSON or missing required fields.
- `ai-surface/agent-instruction-files` rule — detects whether the repo
  ships agent instruction files (`.cursor/rules/*.mdc`, `.cursorrules`,
  `CLAUDE.md`, `.windsurfrules`, `.github/copilot-instructions.md`, etc.)
  that tell coding agents *how* to use the design system. Warning when
  no instruction file is present; warning per file on quality issues
  (too short, missing front-matter for `.mdc`, missing component
  guidance). Allowlist via `lyse-disable
  ai-surface/agent-instruction-files` in the root README.

### Changed

- Promote the 3 AI-Consumable sub-axes (`ai-surface.agents-md-quality`,
  `ai-surface.component-manifest-json`, `ai-surface.ds-index-exported`)
  from `experimental` to `stable` in
  `packages/core/src/reliability/catalogue/sub-axes.ts`. Detection logic
  is unchanged; this is a scoring-status promotion only. Audit Health
  Score is unaffected at v0.1 (the active `scoreFromFindings` scorer is
  axis-weighted and ignores sub-axis status); the change is visible
  through `lyse explain --score` and `docs/architecture/per-rule-slo.md`.
- `tokens/dtcg-conformance` is now a strict W3C DTCG validator. The rule
  walks every leaf token and emits one finding per check:
  - **warning** — leaf has `$value` but no `$type` (with an inferred-type
    suggestion when the value shape is unambiguous).
  - **error** — alias `{group.name}` does not resolve in the document.
  - **error** — `$type: "color"` but `$value` is not a valid CSS color
    (hex / `rgb()` / `hsl()` / `oklch()` / named).
  - **error** — `$type: "dimension"` but `$value` lacks a CSS unit.
  - **error** — `$type: "fontFamily"` but `$value` is not a non-empty
    string or array of strings.
  - **error** — `$type: "fontWeight"` but `$value` is outside `[1, 1000]`
    and not a named weight.
  - **error** — `$type: "duration"` but `$value` is not `<number>(ms|s)`.
  - **error** — `$type: "cubicBezier"` but `$value` is not a 4-number
    array, named easing, or `cubic-bezier()` expression.
  - **error** — `$type: "number"` but `$value` is not a finite number.
  - **warning** — composite tokens (`shadow`, `typography`, `border`,
    `transition`, `gradient`) with malformed `$value` shape.

  Per-token opt-out via the standard DTCG extension mechanism:
  `$extensions.lyse.disable: ["tokens/dtcg-conformance"]` (or `"all"`).
  Implements lyse-labs/lyse-internal#24.

### Changed (BREAKING)

- `tokens/dtcg-conformance`: most type-shape mismatch findings escalate from
  `warning` to `error`. Existing token files with malformed `$value` shapes
  that previously emitted warnings now emit errors. Composite types
  (`shadow`, `typography`, `border`, `transition`, `gradient`) keep `warning`.

### Documentation

- New per-rule page `docs/rules/tokens-dtcg-conformance.md` (Why · How ·
  Examples · Auto-fix · Allowlist · See also).

## [0.1.0-alpha.2] — 2026-06-04

First public release on npm under the scoped name **`@lyse-labs/lyse`**.
The unscoped `lyse` package name on npm was previously claimed by another
publisher and is in tombstone state, so installs use the scoped form:

    npx @lyse-labs/lyse audit
    npm install -g @lyse-labs/lyse

The CLI binary itself is still invoked as `lyse` after install.

### Added

- Opt-in email capture for release & security updates at the end of
  `lyse init` AND `lyse audit` (whichever the user reaches first). Asked
  at most once per machine and delivered to `api.getlyse.com/v1/profile/email`
  with at-least-once semantics:
  - Accept ⇒ persist `{ email, createdAt, lyseVersion, sentAt? }` to
    `~/.lyse/profile.json` and POST. `sentAt` is stamped after a 2xx.
  - Skip ⇒ persist `{ declined: true, declinedAt, lyseVersion }`. No POST.
  - Captured-but-undelivered emails are retried by `syncPendingEmail` at
    the start of every `lyse audit` (incl. non-TTY / CI) so the queue
    drains as soon as the network recovers. Worker upserts on email.
  - Skip paths: `--yes`, `LYSE_NO_EMAIL_PROMPT=1`, CI, non-TTY, or empty
    Enter. `LYSE_NO_EMAIL_POST=1` suppresses the network POST only.
    `LYSE_EMAIL_ENDPOINT` overrides the URL for local dev / self-hosting.
- Interactive root menu (REPL). Running `lyse` with no subcommand on a TTY
  now opens a select menu — Run audit · Apply auto-fixes · Set up MCP for
  AI · Explain a rule · Bench-pack · Telemetry settings · Exit — and loops
  back to the menu after each action instead of exiting. Suppressed by
  `--no-menu`, `LYSE_NO_MENU=1`, or any non-TTY context (CI, piped stdin),
  where the standard help text is printed instead. Invoking a subcommand
  directly (`lyse audit`, `lyse fix`, …) bypasses the menu.
- `lyse audit --limit=<n|all>` — control how many findings the text / eslint /
  legacy outputs render. Default `10`; `all` (or `0`) shows every finding;
  `--format=json|sarif` ignores the flag and always returns the full report.
  The post-audit "Show findings" menu entry now honours the same value.
- `withSpinner()` helper applied across long-running commands (`fix`, `init`,
  `mcp setup`, `bench-pack`). Suppressed by `--quiet`, `LYSE_QUIET=1`,
  non-TTY stderr, or `--format=json|sarif`.
- `lyse audit` — local-first design-system health audit (Health Score 0–100,
  5-tier maturity model, deterministic output).
- `lyse fix` — high-confidence codemods (color, spacing, shadow, naming) with
  6 safety guards (clean git tree, dry-run by default in non-TTY contexts,
  per-run file-count cap, etc.).
- `lyse explain` — per-rule rationale, examples, and links to documentation.
- `lyse init` — opinionated bootstrap of `.lyse.yaml`, `lyse.components.json`,
  and `AGENTS.md`.
- `lyse mcp` — Model Context Protocol server exposing `audit_file` and
  `suggest_fix` tools to AI agents.
- 12 audit rules across 5 axes (tokens, a11y, components, stories, ai-surface).
- Companion benchmark corpus (70 OSS design systems) maintained in
  [`github.com/lyse-labs/lyse-bench`](https://github.com/lyse-labs/lyse-bench)
  (CC BY 4.0) for Health Score reproducibility.
- Opt-in anonymous telemetry (`LYSE_TELEMETRY=1`) feeding the public bench.
  No source code, file paths, or content leaves the user's machine.
  See [`PRIVACY.md`](./PRIVACY.md).

### Fixed

- MCP `audit_file` tool's `AUTO_FIXABLE_RULES` is derived from the rule
  registry, so adding a rule with `applyCodemod` is automatically reflected.
- Post-audit menu shows the "Auto-fix N high-confidence findings" option,
  classifying fixable findings the same way `lyse fix` does (shared
  `buildClassifyContext` / `countAutoFixable` helpers).
- Score gauge renders the `N experimental (not counted)` suffix and the
  ESLint-style output renders the `EXP` tag on low-confidence findings.
  The CLI calls `populateConfidence(result, ctx)` once after `auditDirectory`
  so every downstream consumer (score gauge, ESLint-style renderer,
  JSON/SARIF reporters, telemetry) sees the same per-finding confidence
  classification.
- `lyse share` shows the same phase-by-phase spinner as `lyse audit` while
  re-running the audit.

### Architecture

- Local-first by default. The CLI runs entirely on the user's machine.
- A small Cloudflare Worker (`api.getlyse.com`) handles opt-in telemetry
  and bench aggregation. Its source lives in a separate private repository;
  the CLI communicates with it strictly over HTTPS.
