# Changelog

All notable changes to Lyse will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **A single malformed token file no longer crashes the whole audit.** `loadTokens` read DTCG `*.tokens.json` files with a bare `JSON.parse(readFileSync(...))` inside a `Promise.all` (and the Tailwind v4 path read candidate CSS with a bare `readFileSync`), so one broken `.tokens.json` — or a file deleted/permission-denied between the glob and the read — rejected the whole batch and took the audit down. Both now degrade gracefully (skip the unreadable/unparseable file, keep loading the rest), matching the existing Style-Dictionary loader's behavior. A stderr warning names each skipped file, so a broken token map isn't masked (a missing token entry would otherwise surface as a false-positive "hardcoded" finding).

- **`lyse fix` now actually honors its documented non-TTY safety guard (Guard 6).** The "non-TTY contexts default to `--dry-run`" guard was documented but never implemented — `fixCommand` forwarded `--dry-run` as-is (default `false`), so a CI/piped invocation would mutate and commit the repo unattended. It now defaults to dry-run whenever stdout is not a TTY; an explicit `--dry-run` / `--no-dry-run` always wins, and a stderr notice explains the default + the `--no-dry-run` opt-in for unattended applies. **Behavior change** — if you ran `lyse fix` in CI expecting it to write and commit, pass `--no-dry-run` to keep that behavior.

- **Comment and token-definition false positives removed from 7 hardcoded-value rules.** `tokens/no-hardcoded-{z-index,opacity,border-radius,border-width,shadow,typography,motion}` scanned raw declaration text without the comment / CSS-custom-property guards that `no-hardcoded-color` and `no-hardcoded-spacing` already apply. So a documented old value in a comment (`/* z-index: 9999 — old */`) fired a finding, and `no-hardcoded-motion` flagged a `cubic-bezier(...)` sitting in a token *definition* (`:root { --easing-standard: cubic-bezier(...) }`). All seven now skip values inside comments/URLs and inside `--custom-property:` declarations — in the extractor, so the skipped values no longer count as scored *opportunities* either. `no-hardcoded-motion` is a scored sub-axis, so this also stops it from deflating the Health Score of design systems that define their easing tokens in CSS.

- **`components/no-native-shadows` codemod no longer emits a corrupt patch.** When the DS component wasn't already imported, the fix concatenated two independently-generated diffs (the import insertion + the tag replacement), each computed against the *original* file. The second hunk's line offsets were therefore wrong once the first hunk changed the file length, and `git apply` rejected (or mis-applied) the patch. The two edits are now emitted as a single hunk under one `--- a/ +++ b/` header (new `insertAndReplaceDiff`), so the patch applies cleanly. When the closing tag is on the same line, **both** tags are now rewritten (`<button>…</button>` → `<Button>…</Button>`) so the result is valid JSX rather than a mismatched `<Button>…</button>`. Snapshots regenerated and each verified to apply via `git apply`.

- **No more false positives on Vue/Svelte `<style lang="scss">` (#102).** SFC `<style>` blocks were scanned as plain CSS regardless of `lang`, so a `<style lang="scss">` (the overwhelmingly common case in Vue/Nuxt) had its SCSS `$`-var *definitions* and `//`-comment values flagged as hardcoded drift — a real false-positive flood on SCSS-based component design systems. SFC style extraction is now **lang-aware** (scss blocks run through the same `transformScssToCss` pass as `.scss` files; `sass`/`less`/`stylus` blocks are skipped rather than mis-scanned) and **line-preserving** (findings now report the correct `.vue`/`.svelte` source line instead of a line relative to the extracted snippet — so `lyse fix` and SARIF locations land correctly). Verified end-to-end: an identical SCSS body now yields the same single finding whether it lives in a `.scss` file or a Vue `<style lang="scss">` block.

- **Cross-platform git invocation + path handling (#104, Windows).** Surfaced by the new Windows CI lane: (1) the build's manifest step did `import(absolutePath)` → fixed with `pathToFileURL`; (2) finding `location.file` was relativized via `abs.startsWith(root + "/")`, which fails on Windows (fast-glob returns `/`, the repo root uses `\`) — added a `posixRelative` helper so finding/import paths are relative `/` on every platform (fixed the walker + stories/contracts); (3) `git-helpers` ran shell command strings with POSIX single-quote escaping → switched to `execFile("git", argsArray)` (no shell, no quoting) so the commit/branch/guard paths work on Windows; (4) `.gitattributes` (`eol=lf`) so byte-for-byte fixtures/snapshots match on Windows checkouts. The `test-windows` lane is advisory until the remaining divergences clear.

- **Second Windows wave (#104).** Three more product path bugs the lane caught: (1) MCP install-mode detection matched `${sep}node_modules${sep}` — on Windows `sep` is `\`, so a `/node_modules/` argv1 mis-detected as dev mode; now separator-agnostic via `toPosix`. (2) `lyse add ci-gate` returned `relative()` paths (`\`-separated on Windows) for its `written`/`skipped` lists → posix-normalized for deterministic cross-platform output. (3) `meta.coverage.configPath` was the raw OS path → posix-normalized. Plus test-harness fixes: converted the remaining shell-chained git setup (`fix-end-to-end`, `init-fresh-repo`) and the `shell:"/bin/bash"` + `> /dev/null` CLI integration / agents-alias tests to the no-shell `execFileSync` helper (also setting `USERPROFILE` alongside `HOME`, since Windows `os.homedir()` ignores `HOME`); skipped two genuinely POSIX-only tests on Windows (`chmod 600` mode bits, `symlinkSync` which needs elevation).

### Changed

- **Windows CI lane (#104) — now hard-failing.** Added a `test-windows` job (windows-latest) running the full type-check + test suite, to catch path-handling / line-ending / filesystem case-sensitivity divergences behind the cross-platform trust claims. The full suite is now green on Windows, so `continue-on-error` is dropped — Windows regressions fail the build.

- **Mutation testing on the scoring engine (#104).** Wired Stryker (`@stryker-mutator/core` + vitest runner, `pnpm mutation`) scoped to the four trust-bearing scoring files (`scorer.ts`, `formula-v1.ts`, `grace.ts`, `grade.ts`) with `perTest` coverage. The initial run scored **91.3 %** and surfaced ~6 genuine test gaps — now closed with targeted tests (exact score-formula value, exact grace-blend value, ai-governance-only blending, a11y/stories bucket aggregation, unknown-axis guard, the N/A grade path, and a conformal-gate boundary at `confidence === θ`) — lifting the score to **94.95 %**. The remaining survivors are equivalent mutants (e.g. `K=0` makes `±` identical, `grace=1` makes `<=1`/`<1` identical) and are documented as such. A break threshold of 85 % guards the engine against future test regressions. (Property-based suites landed earlier; the Windows CI lane remains for #104.)

- **Fuzz hardening of the MCP `audit_file` entry point (#104).** A fast-check property suite throws adversarial TSX/CSS buffers at `audit_file` — the agent-facing API that runs the full parse → all single-file rules → score path on in-progress, often syntactically-broken code. Verifies it is **total** (never throws, always returns a well-formed `{ schema_version, violations[] }` result) and **deterministic**, across adversarial input + empty/whitespace buffers. No rule crashes on fuzzed input — the tool can't be taken down by a malformed buffer.

- **Property-based hardening of the scoring engine (Track 15.3 / #104, partial).** Added fast-check property suites for both scorers (`scorer.ts` v2 + `computeScoreV1` trusted) that verify the determinism + robustness invariants behind the public trust claims: score always an integer in `[0,100]` (or N/A); fully deterministic; zero-opportunity axes always N/A; counted + reported-only always equals the finding count; and the new ai-governance grace ramp is sound (a lower grace factor never *lowers* the score, grace=1 is inert, and grace touches only ai-governance). All invariants hold across thousands of generated inputs — the moat scoring (9 promotions + grace this cycle) is verified regression-safe. Also fuzzes the regex-based source scanners shipped this cycle (`scanDeprecationMarkers`, `scanSvgElements`) for totality (never throws), determinism, line-bounded output, and absence of catastrophic backtracking (pathological input resolves < 1 s). (Mutation testing + the Windows CI lane remain for #104.)

- **Early-adopter grace ramp for the ai-governance axis (Track 11.4 / #89, ADR-0018).** Adding a single `AIBadge` to a healthy design system used to **crater the score ~−20 pts** (trusted score 81 → 58; `lyse audit` 60 → 40): the ai-governance axis activated and the full weight of ~10 governance affordances landed at once on a surface that had just started. The axis now **ramps in with AI-surface maturity** — `graceFactor = min(1, aiMarkerCount / window)` (window configurable via `scoring.aiGovernanceGraceWindow`, default 5). At 1 AI marker the axis weighs ≈ 20 %; at 5+ markers, fully. Findings are still **reported** at every stage — only their score contribution ramps in, so the guidance is visible from day one without the cliff. Applied in both score paths (`computeScoreV1` trusted score scales ai-governance findings' penalty; the per-axis `scorer.ts` blends the ai-governance axis toward neutral). Grace touches **only** ai-governance; every other axis is scored fully from the first finding. The `full-ds` smoke band is unchanged.

- **`tokens/no-hardcoded-border-width` and `tokens/no-hardcoded-motion` promoted into the trusted v1 score (41 → 43 stable sub-axes).** Their earlier oracle-valid precision looked terrible (border-width 0.16, motion 0.41) — but that was an **oracle-config gap, not Lyse imprecision**: the cross-tool stylelint config only watched the longhand properties (`border-width`, `transition-duration`), not the shorthands (`border:`, `transition:`, `animation:`) where Lyse correctly flags the literal. Adding the shorthands lifts oracle-valid precision to **border-width 0.982 (LB 0.974)** and **motion 0.934 (LB 0.918)**; recall is 42/42 (LB 0.916). This completes the token-scale axis: **all 7 non-color hardcoded-value rules are now scored** (color stays experimental — cross-tool structurally invalid → LLM-adjudicator track). None fire on `full-ds` → smoke band unchanged (73 / 11).

- **4 more token-scale rules promoted into the trusted v1 score (37 → 41 stable sub-axes).** Extending the oracle-valid method that unblocked spacing to every token property group: `tokens/no-hardcoded-z-index`, `tokens/no-hardcoded-opacity`, `tokens/no-hardcoded-border-radius`, and `tokens/no-hardcoded-typography` all clear **both** gates — cross-tool **precision** (oracle-valid Wilson LB: z-index 0.988, opacity 0.989, typography 0.989, radius 0.958, restricted to the slice stylelint can parse) and synthetic **recall** (42/42 → LB 0.916). Their raw cross-tool precision looked terrible (0.13–0.99) purely because of stylelint blind spots (calc / SCSS helpers / token-defs); the oracle-valid restriction + a per-item audit (no clean Lyse FP class; residual is test fixtures + stylelint misses) shows the real precision is ≥0.96. None fire on the clean `full-ds` fixture, so the smoke band is unchanged (73 / 11). **Still experimental:** `no-hardcoded-shadow` (oracle-valid 0.79), `no-hardcoded-border-width` / `no-hardcoded-motion` (blocked on stylelint *shorthand* property coverage — `border:`/`transition:` — an oracle-config gap, not Lyse imprecision), and `no-hardcoded-color` (cross-tool structurally invalid → LLM-adjudicator track). Methodology + reproducible scripts in `lyse-internal` (`cross-tool/oracle-valid-precision.py`, all-groups).

- **`tokens/no-hardcoded-spacing` promoted into the trusted v1 score (36 → 37 stable sub-axes).** The long-documented spacing precision "wall" (cross-tool pooled precision 0.81, below the 0.90 gate → previously DEFERRED) turned out to be a **measurement artifact, not a Lyse defect**. Re-analysing the 10-repo cross-tool corpus restricted to the subset `stylelint-declaration-strict-value` can actually parse (plain literals — excluding `calc()`, SCSS unit-helpers like `convert.to-rem()`, interpolation, and `var()` fallbacks, which stylelint structurally cannot see), Lyse's spacing **precision is 0.990 (Wilson 95% LB 0.985)** — far above the gate. Of 719 Lyse-only disagreements, 688 are stylelint blind-spots (real drift Lyse correctly catches) and only 31 are plain literals, none a clean false positive on per-item audit. Recall was already 1.0. The exclusion is principled (by value *syntax* = the oracle's domain of validity, not by agreement outcome), so the evidence is non-circular. Full methodology + reproducible script in `lyse-internal` (`cross-tool/ORACLE-VALID-PRECISION-REPORT.md`). **`tokens/no-hardcoded-color` stays experimental** — cross-tool is structurally invalid for color (property-scope mismatch), pending a separate LLM-adjudicator validation. The `full-ds` smoke band moves to `[70, 76]` / `[9, 13]` counted (the fixture has one hardcoded-spacing finding that now scores: 78 → 73).

### Added

- **Vue/Svelte `<script>` blocks are now scanned (#102).** SFC ingestion previously covered only the `<style>` block, so a hardcoded value living in a component's `<script>` / `<script setup>` (real TS) was silently missed — the equivalent `.tsx` flagged it. The `<script>` block is now extracted (`src/parsers/sfc-script.ts`, line-preserving, `src=`-external refs skipped) and fed to the same TS path as `.tsx`/`.jsx` (token rules, CSS-in-JS, import/usage detection). Verified: a `.vue` whose `<script setup>` holds `const accent = "#3B82F6"` now reports the drift on its correct source line, matching the `.tsx` equivalent. `<template>` is intentionally not parsed (its directive syntax is not JSX — scanning it as JSX would manufacture false positives).

- **`components/svg-viewbox` — inline `<svg>` icons must declare a `viewBox` (Track 16.6, area I).** Scans JSX for inline `<svg>` opening tags and warns on any without a `viewBox` — a fixed-size SVG with no viewBox doesn't scale and can crop. Pure structural check (presence of the attribute, never its value), so synthetic precision equals real precision. Self-gating (no inline SVG → N/A) and skips `<svg {...spread}>` (viewBox may arrive at runtime) to avoid false positives. First scored dimension of area I (icons) beyond `components/no-icon-fonts`. 52 → **53 rules**. Cleared both gates (recall LB **0.9036**, precision LB **0.9011**, 2026-06-18 synthetic recall-suite run) and is **promoted into the trusted v1 score** (35 → **36 stable** sub-axes).

- **MCP `audit_file` per-project context cache + Carbon-scale P95 benchmark (Track 13.4).** The single-file audit path used to reload the whole repo context (token registry, story index, config — each a full-tree scan) on *every* call, blowing the MCP P95 budget on large repos. A new per-project-root context cache (short TTL, explicit `clearProjectContextCache()` for a future watch daemon) reuses it across the hot-path burst of audits. A new perf-CI benchmark generates a Carbon-scale repo (~500 components, real DTCG tokens + stories) and asserts **warm `audit_file` P95 < 300 ms** (the #97 exit gate; measured ~2 ms) and that the cache materially cuts per-call cost (cold ~8 ms median → warm ~0.8 ms). The incremental watch daemon (FS-event-driven cache invalidation) is deferred.

- **MCP `preflight_diff` — compiler-style pre-write guardrail (Track 13.3).** A third MCP tool: the agent passes a file `path` + the full proposed `content` (post-edit buffer) and Lyse returns a block/pass verdict *before* the write lands. Findings are partitioned into **`blocking`** (stable rules only) and **`advisory`** (experimental rules) — a `blocked` verdict requires at least one stable-rule violation. Blocking on experimental rules would be indefensible, so precision-walled rules like `tokens/no-hardcoded-color` are advisory-only and never reject a valid edit. Reuses the single-file audit path, so `rules: { <id>: off }` and inline suppression are respected. Actionable output (rule, line, message, suggestion) + a human summary. New `stableRuleIds()` resolver maps the stable sub-axis set to rule ids.

- **`lyse fix --migrate-tokens` — convert legacy token JSON to DTCG (Track 12.1).** The second AI-readiness codemod: discovers Style-Dictionary / Tokens-Studio `{ value, type }` token files (`**/tokens.json`, `tokens/**/*.json`, `*.tokens.json`) and rewrites each to DTCG `{ $value, $type }` (mapping the legacy `type` name to a DTCG `$type`, carrying `description` → `$description`, preserving groups and `{alias}` references). **Safe by construction:** every converted document is validated against Lyse's own `tokens/dtcg-conformance` walker *before* writing — a file is skipped (reported, untouched) if conversion would produce any non-conformant token (e.g. a unitless dimension) or carries an unmappable type, so the codemod never emits broken DTCG or guesses missing data (like a unit). Behind the existing 6 safety guards + a dedicated commit; idempotent (already-DTCG files are skipped); `--dry-run` reports paths without writing. The remaining two #92 codemods (wrap-ai-token, disclaimer/feedback insert) mutate JSX and stay deferred.

- **Config: severity overrides + `@lyse-overrides` per-file frontmatter are now applied (Track 17.6b).** Three previously validated-but-inert config affordances are wired: (1) **`rules.<id>.severity`** overrides now change the **displayed** severity (terminal / JSON / SARIF) — applied *after* scoring so a config override never moves the Health Score (scoring always uses each rule's canonical severity; the determinism contract holds). (2) **`@lyse-overrides` JSDoc frontmatter** at the top of a file: `<rule-id>: off` suppresses that rule's findings in the file (like an inline `lyse-disable`, dropped from the score), and `<rule-id>: error|warning|info` overrides display severity for that file (per-file wins over global on conflict). (3) The **MCP `audit_file`** single-file path now respects `rules: { <id>: off }` (it previously loaded config but ignored disables). Per-rule `tolerance` remains deferred — it needs near-match matching semantics the exact-match rules don't yet implement (a rule-semantics + recalibration change, tracked separately).

- **`versioning/deprecation-markers` — `@deprecated` JSDoc tags must carry migration guidance (Track 16.5, area J).** Scans TypeScript/JavaScript JSDoc block comments for `@deprecated` tags and warns on any that are *bare* — no inline description, no wrapped description, no `@see` sibling, and no inline `{@link}`. A bare `@deprecated` is a dead-end for a coding agent: it knows the symbol is going away but not what to use instead. Pure structural check (never inspects prose semantics — that residual stays in the LLM-graded layer), so synthetic precision equals real precision. Self-gating: a design system with no `@deprecated` tags records zero opportunities and is N/A, never penalized for lacking deprecations. This is the **deterministic component-level half** of the area-J `@deprecated` dimension (the token half, `tokens/deprecated-token-usage`, already shipped). 51 → **52 rules**. Cleared both gates (recall LB **0.9036**, precision LB **0.9011**, 2026-06-17 synthetic recall-suite run) and is **promoted into the trusted v1 score** (34 → **35 stable** sub-axes). N/A on the clean `full-ds` fixture (no `@deprecated` tags), so the smoke band is unchanged (78 / 9).

- **`lyse fix --scaffold` — generate missing AI-readiness files (Track 12.1).** The detect→fix leap: where the `ai-surface` / `ai-governance` rules flag *absent* artifacts, `--scaffold` now generates rule-passing templates for the missing ones — `llms.txt` (H1 + blockquote + linked sections), `AGENTS.md` (runnable setup block + exit-code + toolchain refs), and a value-gate governance doc (`AI_GOVERNANCE.md`, go/no-go checklist). Idempotent (skips any target whose known search paths already exist, including `.github/`/`docs/` variants), behind the existing 6 safety guards (clean tree, own branch, dedicated commit), and dry-run reports the paths without writing. `llms.txt` is titled from `package.json`'s name.

### Changed

- **Batch promotion: 6 deterministic rules into the trusted v1 score (28 → 34 stable).** Already-shipped `experimental` rules that had no recall-suite generators (so were never measured and stayed reported-only) got synthetic generators and were measured — all cleared **both** gates (2026-06-17 run): `a11y/prefers-reduced-motion`, `a11y/focus-visible`, `a11y/inclusive-language`, `tokens/responsive-breakpoints`, `components/no-icon-fonts` (recall LB 0.901, precision LB 0.904), plus **`a11y/essentials`** — the core jsx-a11y rule — whose precision was a clean zero-false-positives but whose compliant generator had only 34 cases (Wilson LB 0.898); expanding it past N=36 lifted the LB to **0.908**. This scores three previously-unscored areas (a11y depth, responsive, assets) without writing new rules — the **first a11y sub-axes to count toward the Health Score**.

- **Trusted Health Score now counts 22 sub-axes — the AI-governance moat is scored (AI-governance moat-scoring track, `lyse-internal`).** Promoted the 10 deterministic structural sub-axes that cleared **both** the recall *and* precision Wilson 95 % lower-bound gates (≥ 0.90, 2026-06-17 synthetic recall-suite run) from `experimental` into `stable` / `contributesToScore` (12 → 22): `tokens/description-coverage`, `components/no-native-shadows`, `naming/component-pascalcase`, `naming/hook-prefix`, `stories/coverage`, `ai-surface/agents-md-quality`, and the four deterministic AI-governance presence checks (`ai-marker-component-present`, `ai-loading-error-states`, `ai-content-live-region`, `feedback-control-present`). **The Health Score now drops for design systems that ship AI surfaces without governance affordances — this is intentional** (Kavcic: only a minority of surveyed systems ship any AI layer). The `full-ds` smoke band moves to `[75, 81]` / `[8, 11]` counted. These graduated out of the score-v2 preview (the `contributesToScoreV2` flag is now empty — the preview channel remains for the next batch of gate-clearers).

### Added

- **`ai-governance/draft-attribution` — AI-content attribution convention (Track 9.8).** When an AI surface is present, checks whether the design system adopts an AI-content attribution convention. Precision-first detection over `**/*.{tsx,jsx,vue,md,mdx,ts}`: the phrase form requires `first draft` anchored to an authoring verb (created/made/generated/written/drafted) + with/by/using — so generic "Created with Sketch" / "first draft of the proposal" don't match — plus distinctive structured markers (`data-ai-generated`, `ai-generated`/`aiGenerated`, `drafted-with`, `DraftAttribution`/`AiAttribution`/`GeneratedWith*`). Info when present, warning when an AI surface lacks it, silent on non-AI systems. 50 → **51 rules**. Cleared both gates (recall LB **0.901**, precision LB **0.901**, 2026-06-17 synthetic recall-suite run) and is **promoted into the trusted v1 score** (27 → **28 stable** sub-axes).

- **`ai-governance/interaction-pattern-docs` — in-repo docs for AI interaction patterns (Track 9.9).** When an AI surface is present, checks whether the design system documents its AI interaction patterns. Heading-based + AI-context-gated detection over `**/*.{md,mdx}`: counts the six Kavcic/HAX interaction types (suggestion, generation, authorization, handoff, regeneration, history) appearing as a `#` heading, but only in docs that reference an AI surface — so a generic `## History` (changelog) or `## Generation` (release notes) in non-AI docs doesn't count, and body-text mentions are ignored. Info (lists coverage n/6) when documented, warning when an AI surface ships without pattern docs, silent on non-AI systems. 49 → **50 rules**. Cleared both gates (recall LB **0.901**, precision LB **0.901**, 2026-06-17 synthetic recall-suite run) and is **promoted into the trusted v1 score** (26 → **27 stable** sub-axes).

- **`ai-governance/ai-token-misuse` — AI-reserved tokens used outside AI surfaces (Track 9.5, area L).** Flags reserved AI design tokens (Carbon `--cds-ai-*` / `$ai-aura-*`, Cloudscape `$*-gen-ai`, Polaris `magic-*`) *used* (`var(--ai-*)`, `$ai-*`, `theme.$ai-*`) in a file that is not an AI surface — diluting the "this is AI" visual signal. Conservative by design: usage only (never token *definitions*), with three AI-context suppressors (AI-marker component, AI-named path like Carbon's `_ai-aura.scss`, or local AI-token definition) to keep precision high; silent on systems with no reserved AI tokens. 48 → **49 rules**. Cleared both gates (recall LB **0.912**, precision LB **0.901**, 2026-06-17 synthetic recall-suite run) and is **promoted into the trusted v1 score** (25 → **26 stable** sub-axes).

- **3 new AI-governance affordance rules — deepening the moat (area L).** Three deterministic, structural rules covering Kavcic AI-design dimensions not previously detected, each gated on AI-surface presence and per-file co-located with an AI marker (info when present, warning when an AI surface exists without the affordance, silent on non-AI design systems): `ai-governance/confidence-indicator-present` (confidence/uncertainty indicators — HAX G2 / PAIR Trust), `ai-governance/source-attribution-present` (citation/attribution/provenance UI — HAX G11 / PAIR Explainability), `ai-governance/bot-identity-labeling` (non-human bot/avatar identity labeling via distinctive compound vocabulary that avoids the `bot`/"bottom" substring trap — HAX G1 / PAIR "Set expectations"). 45 → **48 rules**. All three cleared **both** gates (recall *and* precision Wilson 95 % LB **0.901**, 2026-06-17 synthetic recall-suite run) and are **promoted into the trusted v1 score** (22 → **25 stable** sub-axes). They are silent on design systems with no AI surface, so only AI-shipping systems are scored on them — deepening the moat penalty for AI-without-governance.

- **score-v2 PREVIEW channel — the moat becomes measurable (AI-governance moat-scoring track, `lyse-internal`).** A read-only preview score, surfaced by `lyse explain --score` alongside the trusted v1 score, that counts a **superset** of the v1 stable set: any sub-axis flagged `contributesToScoreV2` (deterministic gate-clearers that pass recall *and* precision Wilson 95 % lower bounds ≥ 0.90 but are not yet promoted into the live score). New `SubAxisRecord.contributesToScoreV2` flag + `resolveScoreV2PreviewSubAxes`; the trusted (v1) score is never affected. It exists so the impact of a future promotion can be inspected before any v1 change. (The first cohort it surfaced was promoted into v1 in the same release — see *Changed* above — so the preview currently has zero pending delta; the mechanism stays for the next batch.)

- **Property-based tests on the detectors (Track #104, partial).** Added `fast-check` and a property suite that proves the pure detectors are **total** (never throw on arbitrary input) and honor their core invariants for *all* inputs, not just example cases: `isReservedTokenName` is deterministic + matches every vendor signature + never matches a bare `ai-*` without an AI-distinctive descriptor (the Mantine FP guard, now fuzz-verified); the z-index extractor never returns trivial `-1/0/1`; and `computeGrade` always yields a valid grade and always auto-fails on ≥2 zero-score axes. The mutation-testing and Windows-CI lanes from #104 remain open (mutation = heavy Stryker infra + a surviving-mutant budget decision; Windows = needs real Windows runs to fix divergences, can't be verified green from here without making a red lane required).

- **`lyse mcp setup` now supports Copilot / VS Code (Track #98).** Beyond Cursor (`.cursor/mcp.json`) and Claude Code (`.mcp.json`), setup now targets **Copilot / VS Code** — writing `.vscode/mcp.json` under the `servers` key (not `mcpServers`) with `"type": "stdio"`, the shape VS Code's MCP client expects. `--target` accepts `cursor | claude-code | copilot | both | all` (`all` = every detected client); detection now includes `.vscode/`. All writes are idempotent and preserve pre-existing unrelated server entries.

- **Svelte / Vue single-file-component style coverage (Track #102).** The walker now scans `.svelte` and `.vue` files, and a new `extractSfcStyleBlocks` parser pulls their embedded `<style>` blocks (`lang="scss"` / `scoped` ignored) into the CSS-scanning path. This closes a systematic blind spot: a Svelte/Vue design system's hardcoded colors / spacing / radii / etc. inside `<style>` were previously invisible to the token-drift detectors. Template/script a11y + naming parity for these frameworks remains a follow-up; Angular external-style files were already covered.


- **Token ingestion: Style Dictionary, Tokens Studio, Figma Variables (Track #103).** `loadTokens` now discovers token maps from the formats teams actually use, not just Tailwind + DTCG. A new `value`/`type` loader normalizes **Style Dictionary** (`{ "value": "#fff", "type": "color" }`) and **Tokens Studio** (`$metadata`/`$themes` wrappers + TS type names like `borderRadius`, `fontWeights`, `boxShadow`) into the existing token-map model, with **explicit type→bucket routing** (more precise than DTCG's path heuristic) and alias (`{token.path}`) skipping. **Figma Variables** are ingested via their committed DTCG / Tokens-Studio export (the de-facto Figma→code path). `TokenMap.source` gains `style-dictionary` / `tokens-studio` / `figma-variables`. The loader chain now falls through empty maps so a non-token `tokens.json` doesn't shadow a real source. This widens where `lyse fix`'s token-map discovery (guard 3) works.

### Changed

- **Recall-validation corpus for AI-token detection (Track #139).** Added a vendored, attributed (Apache-2.0) corpus of real OSS design-system token slices — IBM Carbon (`theme.$ai-*` source + compiled `--cds-ai-*`), AWS Cloudscape (`$*-gen-ai`), and a Mantine/Primer negative control — with a recall test that proves `detectReservedAiTokens` catches the AI-governance tokens of real systems while staying empty on the precision control. Reproducible public evidence underpinning the #71 governance-promotion decision; test-only, no score change.

### Fixed

- **AI-token detection now sees SCSS-authored tokens (`$ai-*` / `theme.$ai-*`) — recall unblock for the moat (Track #139).** `detectReservedAiTokens` previously scanned `.scss` only through `transformScssToCss`, which **blanks `$variable` declarations** — so design systems that author AI tokens in Sass and compile them away were invisible to a source scan. It now also scans the **raw SCSS `$variable` source** (declarations and namespaced `theme.$ai-*` usages) through the same precision-gated `isReservedTokenName`. Verified against real OSS sources: **IBM Carbon** (`theme.$ai-aura-start-sm`, `$ai-aura-end` — the `--cds-ai-*` names exist only in compiled CSS) and **AWS Cloudscape** (`$color-text-label-gen-ai`) are now detected at source; precision is preserved (Mantine's `$ai-size`/`--ai-bg` ActionIcon vars and `$spacing-05` still don't match). This is the recall-validation unblock #71 was waiting on — governance presence can now be measured against SCSS-compiled corpora.

### Added

- **New experimental rule `tokens/no-hardcoded-typography` (Track #93).** Flags hardcoded `font-size`, `font-weight`, and `letter-spacing` in CSS / CSS-in-JS that aren't drawn from a typography token scale (`ctx.tokens.typography`, `weight/` + `letter-spacing/` prefixed keys). Precision-tuned exemptions: `font-size` only flags px/rem/em (percentages/keywords exempt); `font-weight` exempts `400`/`700` + keywords; `letter-spacing` exempts `0`/`normal`; `var(...)` always exempt. **`line-height` is intentionally out of scope** (unitless line-heights are pervasive and rarely tokenized → noise). Registered `experimental` + `contributesToScore: false` (reported-only). With this, the #93 token-drift family is complete bar `gradient` (no `TokenMap` field — needs a new token category).

- **New experimental rule `tokens/no-hardcoded-shadow` (Track #93).** Flags hardcoded `box-shadow` values in CSS / CSS-in-JS that aren't drawn from a shadow token scale. Keyword values (`none`, `inherit`) and `var(--shadow-*)` references are exempt; with a scale loaded (`ctx.tokens.shadows`) matching values (whitespace-insensitive) are compliant. The full declaration is treated as one composite unit. Registered `experimental` + `contributesToScore: false` (reported-only). Deepens area A (Tokens). (Remaining #93: typography multi-property + gradient — deferred for careful per-property design.)

- **CI gate v2: grade in SARIF + PR comment, auto-fail callout, per-axis regression markers (Track #91).** The SARIF `run.properties.lyse` now carries `grade` + `grade_auto_failed`. The `lyse add ci-gate` PR-comment script (`lyse-gate.mjs`) now shows the letter grade transition (`**Grade:** A → Fail ⛔ auto-fail`), surfaces an `⛔ Automatic fail` callout listing the reasons when the PR auto-fails, and marks each per-axis row that regressed (`⚠️` below 0, `❌` past the threshold). Completes the actionability trilogy (#88 gap report → #87 grade → #91 gate). The roadmap's anchor-based auto-fail conditions ride on #86/#83 (the grade's own deferral).

- **A/B/C/Fail letter grade + auto-fail on the audit (Track #87).** `lyse audit` now computes a deterministic letter grade from the canonical Health Score — **A** ≥ 80, **B** ≥ 60, **C** ≥ 40, **Fail** < 40 (aligned with the CMMI tier boundaries) — surfaced on `AuditResult.grade` (`{ grade, autoFailed, reasons }`) and shown on the score line in both the rich and `--format text` output (e.g. `Grade Fail (auto-fail)`). An **automatic-fail** condition forces `Fail` regardless of the number: **≥ 2 axes scored 0**. The roadmap's anchor-based auto-fails (over-reliance ≤ 1, agent-expectations ≤ 1) and the vendored Fluent scorecard snapshot depend on the 0–3 anchor model (#86) / LLM rubric dimensions (#83) and are deferred until those land. New pure `reliability/grade.ts` (`computeGrade`). Feeds the badge/SARIF/CI-gate work (#91).

- **`lyse explain --score` now generates an actionable gap report (Track #88).** Beyond the score breakdown and the Kavcic AI-Governance Maturity level, the output now includes a deterministic **"How to improve"** section: (1) a **score gap** — the counted (stable) sub-axes ranked by penalty, each annotated with the approximate Health-Score points recovered if cleared (`~+N pts`, where N = `round(penalty × 1.5)` per the scoring-v1 formula) — only counted sub-axes appear, so the suggested fixes genuinely move the score; and (2) a **maturity gap** — the concrete affordances needed to climb one Kavcic rung (e.g. `L2 → L3 needs an AI interaction affordance …`), or a note when at the statically-detectable ceiling (L4). New pure `reliability/gap-report.ts` (`generateGapReport`) + `GapReport` on `ExplainScoreResult`. Framed as one lens — HAX / PAIR remain the ground-truth anchors. Fully deterministic (same repo → same report).

- **New experimental rule `tokens/no-hardcoded-motion` (Track #93 / #129).** Flags hardcoded transition/animation **durations** (`<n>s`/`<n>ms`, from the longhand or the `transition`/`animation` shorthand) and custom **`cubic-bezier()` easing curves** in CSS / CSS-in-JS that aren't drawn from a motion token scale. Zero durations, `var(...)`, and standard easing keywords (`ease`, `linear`, `ease-in-out`, …) are exempt; with a motion scale loaded (`ctx.tokens.motion`, keys prefixed `duration/`/`easing/`) on-scale values are compliant (whitespace-insensitive). Registered `experimental` + `contributesToScore: false` (reported-only). Completes the motion-token half of #129 and fills area G (Motion).

- **Three more #93 hardcoded-token rules — `tokens/no-hardcoded-opacity`, `tokens/no-hardcoded-border-radius`, `tokens/no-hardcoded-border-width` (Track #93).** All three are repo-wide value-drift detectors mirroring `no-hardcoded-z-index`: they flag a hardcoded value in CSS / CSS-in-JS that isn't drawn from the corresponding token scale (`ctx.tokens.opacity` / `.radii` / `.borderWidth`), with type-specific exemptions to keep precision high — **opacity** exempts the extremes `0`/`1`; **border-radius** exempts `0`, percentages, and the fully-rounded pill idiom (≥ 999px); **border-width** exempts `0` and the `1px` hairline and reads the width out of both the longhand and the `border` shorthand. All exempt `var(...)` references and treat on-scale values as compliant. Registered `experimental` + `contributesToScore: false` (reported-only). Deepens area A (Tokens).

- **New experimental rule `tokens/no-hardcoded-z-index` (Track #93).** Flags hardcoded `z-index` integer literals in CSS / CSS-in-JS that aren't drawn from a z-index token scale — the classic "z-index war" anti-pattern (`9999`, `99999`). Trivial local values (`-1`, `0`, `1`) and tokenized refs (`var(--z-*)`) are exempt; when a z-index scale is loaded (`ctx.tokens.zIndex`), on-scale values are compliant and off-scale values are flagged. Value-drift rule → registered `experimental` + `contributesToScore: false` (reported-only). First of the #93 hardcoded-token breadth rules; deepens area A (Tokens).

- **New experimental rule `a11y/inclusive-language` (Track #135).** Flags a narrow, high-confidence blocklist of non-inclusive terms in TS/JS, CSS, and CSS-in-JS — `whitelist` (→ allowlist), `blacklist` (→ denylist), `sanity check` (→ quick check), `grandfathered` (→ legacy/exempt), `slave` (→ replica/secondary) — one `info` finding each, with the suggested replacement. Tolerant of camelCase / hyphen / underscore. `master` and `dummy` are deliberately excluded to keep precision high. Registered `experimental` + `contributesToScore: false` — reported-only. First coverage of area H (Content).

- **New experimental rule `components/no-icon-fonts` (Track #132).** Repo-level check: a design system should deliver icons as SVG, not as an icon webfont. Detects an icon-font dependency (`font-awesome`, `@fortawesome/fontawesome-free`, `material-icons`, `material-symbols`, `@mdi/font`, `glyphicons`, …), an `@font-face` / `font-family` declaring a known icon-font family, or ligature classes (`material-icons`, `glyphicon`, `fa fa-*`). Emits one warning when any signal is found; SVG-component libraries (`lucide-react`, `@fortawesome/react-fontawesome`, …) are never flagged. Registered `experimental` + `contributesToScore: false` — reported-only until calibration. First coverage of area I (Assets); other #132 sub-checks (icon naming, sizing, decorative aria-hidden, single source) deferred.

- **New experimental rule `tokens/responsive-breakpoints` (Track #128).** Repo-level check: a design system that uses width-based `@media` queries (CSS, SCSS, or CSS-in-JS) should define a tokenized breakpoint scale — loaded breakpoint tokens (Tailwind `screens`, DTCG, CSS vars), SCSS / CSS breakpoint variables (`$breakpoint-*`, `--bp-*`), or a JS/TS `breakpoints` / `screens` object. Emits one warning when the system is responsive but no scale is found anywhere; N/A when there are no width media queries. Registered `experimental` + `contributesToScore: false` — reported-only until calibration. The per-occurrence detection of hardcoded media-query literals (the drift half of #128) overlaps the hardcoded-value rule family and is deferred.

- **New experimental rule `a11y/focus-visible` (Track #130).** Repo-level a11y check: a design system that removes the focus outline (`outline: none` / `outline: 0`, in CSS or CSS-in-JS) should adopt `:focus-visible` — the pseudo-class, or the `focus-visible` polyfill (npm import / `.js-focus-visible` / `[data-focus-visible-added]`), scanned across CSS, CSS-in-JS, and TS. Emits one warning when an outline is suppressed but no `:focus-visible` adoption is found anywhere; N/A when no outline is removed. The modern `:focus:not(:focus-visible) { outline: none }` pattern clears the check. Registered `experimental` + `contributesToScore: false` — reported-only until calibration. (First of the #130 a11y-depth sub-checks; touch-target / semantic-html / live-regions deferred.)

- **New experimental rule `a11y/prefers-reduced-motion` (Track #129).** Repo-level a11y check: a design system that uses CSS motion (a real `transition` / `animation` declaration or `@keyframes`) should honor `prefers-reduced-motion`. Motion is detected from CSS + extracted CSS-in-JS (not TS, so a framer-motion `transition` prop doesn't over-fire); the guard — a `@media (prefers-reduced-motion: …)` block or a JS `matchMedia('(prefers-reduced-motion: …)')` call — is honored from CSS, CSS-in-JS, or TS. Emits one warning when motion is present but no guard is found anywhere; N/A when there is no motion. Registered `experimental` + `contributesToScore: false` — reported-only until calibration. (Motion-token drift, the other half of #129, overlaps #93 and is deferred.)

### Changed

- **CSS-in-JS: extract vanilla-extract object styles.** The CSS-in-JS extractor handled tagged templates (styled-components, Emotion); it now also handles vanilla-extract's object syntax — `style`, `styleVariants`, `globalStyle`, and `recipe` from `@vanilla-extract/css`. The declaration object is serialized back to CSS-ish text (camelCase → kebab-case, recursing into nested selectors / pseudo-states / media / recipe variants) so the existing hardcoded-value detectors (`tokens/no-hardcoded-color`, `tokens/no-hardcoded-spacing`) run over `*.css.ts` files. Import-gated (only when a factory is imported from `@vanilla-extract/css`). Recall-only — no new rule, no scoring change.

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

- **`.lyse.yaml` `rules:` block is now honored, not silently ignored (Track #147).** The `rules:` block (documented for disabling rules and overriding severity) was validated by the config schema and then **discarded** — `LyseConfig` didn't even expose it, so `rules: { stories/coverage: off }` did nothing. Now: (1) `rules` is part of `LyseConfig`; (2) `"off"` / `{ severity: "off" }` disables a rule — it doesn't run and contributes no findings or opportunities; (3) every rule id in the block is validated against the registry (built-ins + generated) at audit start, so a typo'd / renamed id is a **hard error** (`lyse rules` lists valid ids) instead of a silent no-op. Default behavior is unchanged (no `rules:` block → identical audit). Severity overrides to a real level (`error`/`warning`/`info`) and per-rule options (`tolerance`, `disable`) are validated but not yet applied — tracked as a follow-up; docs updated to say so.

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
