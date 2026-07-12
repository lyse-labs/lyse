# React-doctor parity map — everything they have, applied to Lyse

Source: full-repo dissection of `millionco/react-doctor` — **10 parallel
inventories total**: wave 1 (CLI surface, engine, distribution, internal
plumbing) + wave 2, zero-blind-spot pass (governance/community, website
full architecture, rule source + autofix capability, test infrastructure,
release engineering step-by-step, hidden/experimental/env-var sweep).
2026-07-12. Status legend: ✅ Lyse has it · 🔶 partial · ❌ missing.
"Domain-adapted" means translated to design-system drift, not copied.
One correction from wave 1: their `docs/` folder is 3 files, not a
rule-doc corpus (wave-1 claim was wrong, verified directly on disk in
wave 2 — see section F).

## A. Funnel & CLI UX

| # | react-doctor | Lyse | Action (domain-adapted) | Prio |
|---|---|---|---|---|
| A1 | `npx react-doctor@latest` scans instantly, zero prompts | 🔶 | Instant-audit spec written; Task 3 of current plan (paused) | P1 |
| A2 | Animated welcome scene (typewriter, 2× replay for returning users), TTY-only | ❌ | Optional light intro before first card; skip in CI/verbose | P2 |
| A3 | ASCII doctor-face mascot, expression + color per score band, rainbow at 100 | ❌ | Optional: expressive `◈` brand glyph on the card | P3 |
| A4 | Animated score count-up + **projection ghost** "You could improve +N% by fixing the top 3" | ❌ | **Killer fit**: fixGroups already group drift by token — "fix these 12 hardcoded colors → +8 pts". Compute locally (deterministic) | **P1** |
| A5 | "Top 3 errors" grouped BY RULE with ×N badge and "One fix clears all N findings" | 🔶 flat top-5 | Group top findings by rule/fixGroup; "one token clears all 40 sites" | **P1** |
| A6 | `--scope full\|files\|changed\|lines`, `--base`, `--staged`, deprecated aliases warn | ✅ (no `lines`) | Add `--scope lines` later | P3 |
| A7 | `--max-duration <s>` time budget, partial results | ❌ | Same flag, skip remaining rule batches past budget | P2 |
| A8 | `--blocking error\|warning\|none` (advisory default in CI) | 🔶 `--threshold` score | Add severity-based blocking; advisory default everywhere | P1 |
| A9 | `why <file:line>` explains why a rule fired / why a suppression didn't | ❌ (`explain --score` only) | `lyse why src/Button.tsx:42` | P2 |
| A10 | `rules list/explain/set/enable/disable/category/ignore-tag` edit config via CLI | ❌ | Same group writing `.lyse.yaml` (magicast-style safe edits) | P2 |
| A11 | Config: `doctor.config.ts`, published JSON schema, **surfaces** per channel (cli/prComment/score/ciFailure), tag ignores, glob overrides, adopt existing lint config | 🔶 schema ✅ | Add per-channel `surfaces` + rule `tags`; keep YAML | P2 |
| A12 | Post-scan agent handoff prompt (TTY) / install hint (CI) | ✅ ahead | Keep; add the once-per-repo CI hint | ✅ |
| A13 | Clean exit codes (130 SIGINT, 129 hangup), EPIPE guards, removed-flags assert | 🔶 | Harden signals/EPIPE | P3 |

## B. Score & viral loop

| # | react-doctor | Lyse | Action | Prio |
|---|---|---|---|---|
| B1 | **Score computed SERVER-side** (react.doctor/api/score), labels + P0-P3 priority tiers returned, `?ci=1`, `stored` persistence hook | ❌ by design | **Do NOT copy.** Local deterministic score is our differentiator — sell it. Optional opt-in POST to api.getlyse.com for share/persistence only (Worker exists) | P2 |
| B2 | Share URL params (p/s/e/w/f) → animated /share page, dynamic OG card 1200×630, X/LinkedIn intents, dynamic badge SVG + copy snippet | 🔶 `share`/`badge` basic | getlyse.com/share + OG route + dynamic badge; CLI footer prints share URL | **P1** |
| B3 | **Leaderboard** page fed by public benchmarks repo (`leaderboard.json`, add-your-project-by-PR, 1h revalidate) | ❌ (corpus exists!) | lyse-bench leaderboard.json (70 DS pinned) + page + add-by-PR loop | **P1** |
| B4 | GitHub Action: sticky PR comment (marker), inline review comments on changed lines (cap 50, rule-doc links), commit status "Score: X/100", job summary, `fixed-issues` baseline output, **advisory by default, never fails push/main** | 🔶 `add ci-gate` basic | Full Action upgrade to this spec; outputs score/error-count/affected-files | **P1** |
| B5 | `ci install/config/upgrade` CLI (writes workflow, GitLab too, `--pr` mode) | 🔶 partial | Extend `lyse add ci-gate` → `lyse ci` group | P2 |

## C. Agent loop

| # | react-doctor | Lyse | Action | Prio |
|---|---|---|---|---|
| C1 | Skill install into **50+ clients** via `agent-install` npm pkg; curated default set; remembers choice; `--dry-run` | 🔶 4 agents | Adopt `agent-install` (public package) in `lyse install` | **P1** |
| C2 | **Remote-fetched playbook** (`react.doctor/prompts/react-doctor-agent.md`) — server-updatable without reinstall; per-rule prompts fetched on demand | ❌ | Conflicts with our no-surprise-network posture: ship pinned playbook + explicit `lyse install --refresh-playbook`. Per-rule prompts = our rule docs, add stable URLs | P2 |
| C3 | Native agent hooks (scan after edits, Claude Code/Cursor, 120s timeout, non-blocking) | ❌ | Hook: `lyse audit --scope uncommitted --quiet` post-edit | P2 |
| C4 | `install` also writes npm script `doctor`, devDep (PM-detected), CI workflow, pre-commit hook (detects husky/lefthook + 9 managers) | 🔶 skill+hook | Parity: script + devDep + workflow prompts, 9-manager detection | P1 |
| C5 | LSP (`experimental-lsp --stdio`): pull diagnostics, hover, quick-fix suppressions, scan-on-type, status-bar score, `reportFalsePositive` → prefilled GitHub issue; VS Code + Zed extensions consuming it | ❌ | **Transformative for us**: drift diagnostics in-editor while the agent/human types. Big build — phase 4 | P2/P3 |
| C6 | MCP server | ❌ they have none | ✅ Lyse ahead — keep, promote | ✅ |
| C7 | `reportFalsePositive` prefilled issue URL | 🔶 `lyse feedback` | Add prefilled GitHub issue path | P2 |

## D. Engine (domain-adapted, not copied)

| # | react-doctor | Lyse | Action | Prio |
|---|---|---|---|---|
| D1 | Rust oxlint host + 400 JS-plugin rules, codegen'd registry, capability gates (`requires: react:19`, `nextjs`) from bucket dirs | 66 TS rules, manual registry | Registry codegen from rule files (META_REGISTRY is close); declarative `requires: tailwind:4 / storybook / dtcg` capability gates | P2 |
| D2 | LPT size-balanced batches, ≤32 subprocess pool, binary-split retry, OOM rescue | simple parallel parse | Only if perf demands; measure first | P3 |
| D3 | **3-tier caching**: per-file content-hash lint cache, sidecar cross-file cache, whole-result dead-code cache | ❌ | Per-file content-hash cache → repeat audits near-instant | **P1** |
| D4 | Concurrent phase fibers overlapping lint | 🔶 | Later | P3 |
| D5 | Dead-code via **deslop** (unused files/exports/deps, circular imports, duplicate blocks, confidence tiers) in a child process | ❌ | **"deslop for design systems"**: unused tokens, unused DS components, duplicate tokens (same value two names), circular token aliases — a killer missing rule family | **P1** |
| D6 | Supply-chain check (Socket.dev) | ❌ | Skip (out of domain); maybe DS-package version drift later | P3 |
| D7 | `defineRule` meta: tags, `defaultEnabled:false` for noisy rules, `lifecycle:"retired"`, `matchByOccurrence` for PR-baseline matching | 🔶 rich meta | Add tags + defaultEnabled + retired lifecycle + occurrence matching (feeds B4 baseline) | P2 |
| D8 | "Precision over recall" doctrine, carve-outs annotated with the corpus miss that motivated them | ✅ stronger (Wilson LB, honest measurement) | Keep ours; adopt their carve-out annotation style | ✅ |

## E. Internal plumbing & QA

| # | react-doctor | Lyse | Action | Prio |
|---|---|---|---|---|
| E1 | **Liveness gate**: every registered rule must fire on a canonical bad fixture or be allowlisted with reason; stale entries fail | 🔶 validation engine | Add per-rule liveness test — cheap, catches dead rules | **P1** |
| E2 | **Fuzz harness, 4 oracles** (crash / slow>2s / metamorphic invariant / verdict-drop FN-evasion), AFL-style corpus + crossover, 125 checked-in regression fixtures, fire-coverage metric | 🔶 metamorphic partial | CSS/TSX generators + the 4 oracles over our rules | P2 |
| E3 | **delta-audit nightly**: 8 pinned OSS repos, committed `baseline.json`, gates: dead-rule (≥5→0) & spike (≥3× AND ≥20), retry-once on degraded | 🔶 90% exists (.bench-corpus + harness) | Commit baseline.json + nightly cron + the two thresholds | **P1** |
| E4 | **fn-mining**: syntactic variants of each rule's bad pattern → report which do NOT fire (FN candidates), `[carved]` markers | ❌ | Same harness over token/a11y rules | P2 |
| E5 | Perf bench harness: median/MAD, regression gate (10% AND 250ms), host-fingerprint match, determinism asserted across cache cohorts | 🔶 `perf` CI check | Extend with baselines + determinism-across-cohorts assert | P2 |
| E6 | **Dogfood workflow**: every PR builds its own CLI and runs its own Action on the repo | 🔶 smoke | PR self-audit posting the score card comment | **P1** |
| E7 | `pkg-pr-new` preview packages on every commit | ❌ | Add | P2 |
| E8 | npm Trusted Publishing OIDC + provenance, `fixed` version group, dev snapshots `-dev.<sha>`, Sentry sourcemaps | 🔶 changesets ✅ | OIDC + provenance + dev tag | P2 |
| E9 | GitHub Action versioned independently (vN floating major, GPG tags, bump-recommend bot, never `@main`) | ❌ | Adopt when Action ships (B4) | P2 |
| E10 | Telemetry: Sentry wide-event per scan, anonymized, adoption metrics (installCompleted per agent), opt-out | ✅ different | Keep opt-in posture (differentiator); add opt-in adoption metrics | P3 |
| E11 | AGENTS.md (25KB conventions) + **11 internal agent skills**: rule-research → rule-writing → rule-validate → fuzz, `/ship`, `/deslop`, product-thinking, truffler dedup | ✅ superpowers today | Write Lyse-specific skills: rule pipeline wired to our measurement harness; `/ship` | P2 |
| E12 | Config JSON schema codegen from TS types | ✅ parity test | — | ✅ |
| E13 | pnpm supply-chain hardening (`minimumReleaseAge: 7200`, `trustPolicy`, `blockExoticSubdeps`) | ❌ | Copy verbatim | P2 |
| E14 | `llms.txt`, per-rule remote prompts, config schema at stable URL | 🔶 rule docs ✅ | Add llms.txt + stable schema URL | P2 |
| E15 | **CORRECTED (wave 2):** license is NOT plain MIT — "Modified MIT" with an AI/ML-training-data ban and an anti-SaaS-resale clause, gated behind founders@million.dev; their own README says "MIT-licensed" (misleading). Enterprise upsell URL is real and wired into CLI messaging (`--no-score`/API-down path) | ✅ AGPL+Commercial, honestly labeled | Nothing to copy — our dual-license disclosure is already more honest than theirs; add an enterprise contact URL to `lyse handoff`'s failure path if we ever want the same soft-upsell | P3 |

## F. Governance, trust & website reality (wave 2)

| # | Finding | Lyse | Action | Prio |
|---|---|---|---|---|
| F1 | **No CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md, issue templates, PR template, CODEOWNERS, or bot automation (Dependabot/Renovate) anywhere.** `AGENTS.md` is an internal agent-conventions doc, not a public contributor guide. README's "Contributing" section is 2 lines. Virality did not require this plumbing. | 🔶 has CONTRIBUTING.md | **Don't over-invest in governance ceremony for launch** — it wasn't the lever. Keep what exists, skip building more | P3 |
| F2 | Website has **no docs pipeline, no `/docs` route, no search, no playground/sandbox** — the ~100+ per-rule doc pages live on a system outside this OSS repo entirely. Home-page "live" terminal demo is **fully scripted** (hardcoded `DIAGNOSTICS` array + fixed `TARGET_SCORE=42`), not a real scan. | ✅ we have real `docs/rules/*.md` in-repo, openly | **We're already ahead here — say so.** A cheap, honest "scripted demo" on our own site (same technique, labeled as illustrative) is a legitimate low-cost marketing asset; just don't hide that it's scripted | P2 |
| F3 | Website analytics: only `@vercel/analytics`, no PostHog/GA/Mixpanel. No structured data/JSON-LD anywhere except the `/share` OG route. No shadcn — hand-rolled Tailwind v4 CSS-first components, `lucide-react` icons, monospace/terminal aesthetic throughout (dark `#0a0a0a`, box-drawing chars). | ❌ no site analytics decided yet | Adopt the minimal-analytics posture (privacy-consistent with our own opt-in stance); terminal/monospace aesthetic is a good fit for a CLI-first dev tool — consider for getlyse.com | P3 |
| F4 | `@react-doctor/api` is a real, fully-built programmatic SDK (`diagnose()`, `defineConfig`, typed errors) but shipped `private: true` — **never published**, despite looking production-ready. Deliberate restraint: they don't want to commit to a public API contract yet. | ❌ no programmatic SDK | Note the restraint pattern — if/when we build a `@lyse-labs/lyse-api`, consider shipping it private-first too before committing to a public contract | P3 |
| F5 | `deslop-js`/`deslop-cli` are **standalone, general-purpose (non-React) published products** bundled in the monorepo, each with independent npm identity, keywords, and audience — a horizontal tool built once, sold twice (as a react-doctor internal + as its own product). | ❌ | Domain-adapted idea: could `lyse`'s token-diffing/duplicate-detection layer ever stand alone as a general "design-token linter" usable outside full DS audits? Note for later, not now | P3 |
| F6 | CHANGELOG cadence: **102 version headers, `0.0.1`→`0.7.6`**, near-continuous multi-release-per-week velocity, generated by `@changesets/changelog-github` (PR-linked, not hand-written). Confirms "ship fast in public" is core to their growth story, not just the launch tweet. | 🔶 alpha releases, slower cadence | Once out of alpha, bias toward smaller/more frequent releases over batching — visible shipping velocity is itself a trust signal | P2 |

## G. Rule architecture patterns worth stealing (wave 2)

| # | Finding | Lyse | Action | Prio |
|---|---|---|---|---|
| G1 | **Autofix: confirmed NONE, by design, across 4 independent evidence lines** (no `fix` field in the report contract, no `--fix` flag ever existed, the one fixer-shaped config key is parsed but never consumed). Positioning is explicit: "install the skill for your coding agent to learn from the issues and fix them" — the CLI literally builds a **hand-off prompt** telling the agent to fix root causes, never suppress, then **re-run the scan to verify the fix actually landed**. | ✅ same model (`lyse handoff`) | **This is the single strongest validation in the whole parity map** — our positioning is not a compromise, it's the same bet the most successful comparable tool made, independently. Name it as explicitly as they do: audit → agent fixes → re-verify | **P1 (messaging)** |
| G2 | `defineRule`'s tag system (`test-noise`, `react-jsx-only`) centralizes cross-cutting false-positive suppression **once**, applied declaratively via tags, instead of every rule reimplementing "skip test files" / "skip non-JSX dialects" by hand. | 🔶 each rule hand-rolls its own guards | Add a declarative `tags` field to `createLyseRule` meta (e.g. `skip-fixtures`, `skip-non-jsx`) with the skip logic implemented once in `_rule-module.ts` | P2 |
| G3 | Capability-gated rule activation (`requires: ["react-native"]`, `disabledWhen: ["react-compiler"]`) compiles a rule out entirely for projects where it can't apply or is moot — precision bought at the registry layer, not just inside the visitor. | 🔶 some manual `ctx` checks | Formalize `requires`/`disabledWhen` capability tokens in rule meta (`tailwind:4`, `storybook`, `dtcg`) — ties into the parity-map item D1 (registry codegen) | P2 |
| G4 | `defaultEnabled: false` marks noisy/subjective rules as registered-but-opt-in (their `design` bucket: e.g. `no-z-index-9999`, explicitly "house-style, not correctness"). | ✅ we have `experimental`/`contributesToScore` | Already equivalent — no action, just confirms our existing pattern is sound | ✅ |
| G5 | Rule authoring is **not** a scaffolding CLI — it's 3 chained agent skills (`rule-research` → `rule-writing` → `rule-validate`) plus a 300+ line `HOW_TO_WRITE_A_RULE.md` manual, run by a human or agent copying/adapting a nearby existing rule, ending in one mechanical step (`pnpm gen` regenerates the registry from `defineRule` metadata via regex-scan). | 🔶 socle process exists, undocumented as a skill | Write this up as a proper superpowers skill (`.claude/skills/lyse-rule-authoring/`) — codify what the "socle" sub-project process already does informally | **P1** |
| G6 | Their public research artifact: `docs/rule-candidates-backlog.md` — a ~200-candidate rule roadmap, tiered by corroboration strength and false-positive risk, openly committed. | ❌ | Publish our own `docs/superpowers/rule-candidates-backlog.md` from the measurement-report findings — cheap transparency/credibility signal, and a public "here's what's coming" for contributors | P3 |

## H. Test infrastructure patterns worth stealing (wave 2)

| # | Finding | Lyse | Action | Prio |
|---|---|---|---|---|
| H1 | **Terminal-output overflow testing via a headless xterm emulator** (`@xterm/headless`): real CLI stdout bytes are fed through a real terminal emulator sized to a width matrix (`[60,80,100,120,160]`), asserting no unwanted soft-wrap and snapshotting the rendered matrix. This is the formalized version of the ad-hoc tsc-sandbox byte-verification used for `score-card.ts` in this session. | 🔶 manual harness this session | Adopt `@xterm/headless` as a devDependency for `reporters/*.test.ts` — replaces the scratchpad harness with a real, repo-committed, CI-run test utility | **P1** |
| H2 | Hand-rolled, dependency-free JSON-RPC/LSP test client that spawns the **real published server binary** over real stdio and drives the full protocol (initialize, diagnostics, codeAction, hover, custom notifications) — explicitly built to avoid pulling a client library into the package. | ❌ no LSP yet | Reference implementation for our own future LSP work (parity item C5, phase 4) | P3 |
| H3 | Real gaps in their own test rigor, worth knowing so we don't assume "if react-doctor doesn't have it, it's unnecessary": **zero code-coverage tooling**, **zero mutation testing**, **zero property-based testing** outside the fuzz package, **zero tests** on the VS Code/Zed extensions, test files excluded from typecheck in most packages, and two packages (`deslop-cli`/`deslop-js`) silently use Node's built-in test runner instead of the framework their own `AGENTS.md` claims is used everywhere. | — | Don't treat "react-doctor doesn't do X" as evidence X is unnecessary — these are gaps, not decisions. Keep our own coverage/typecheck discipline | ✅ (keep doing what we do) |
| H4 | Extensive CI smoke-test layer beyond unit tests: packed-npm-install smoke test (asserts no forbidden transitive packages land on disk), a **real-pty TTY-prompt smoke test** (Python, `pty.openpty()`), a JSON-report-shape smoke test, a "published deps must be declared" regression guard (the exact class of bug that breaks a CLI post-publish silently). | 🔶 partial (smoke test exists) | Add the "published deps declared" guard and the real-pty prompt smoke test — both are cheap and catch exactly the kind of bug that alpha releases are prone to | P2 |

## I. Release engineering depth (wave 2)

| # | Finding | Lyse | Action | Prio |
|---|---|---|---|---|
| I1 | **npm OIDC Trusted Publishing + provenance** (`id-token: write`, `NPM_CONFIG_PROVENANCE: true`, npm ≥11 pinned) — no long-lived npm token in CI secrets at all. A documented gotcha: `setup-node`'s `registry-url` must be omitted on the OIDC path or it silently breaks trusted publishing. | ❌ likely token-based | **Migrate to OIDC trusted publishing** — removes a long-lived npm token from CI secrets entirely, a real security upgrade, not just parity theater | **P1** |
| I2 | **Sentry sourcemap injection tied to the release step itself** (`sentry-cli sourcemaps inject` into `dist/`, release named `<pkg>@<version>`), wrapped so a Sentry outage never blocks a release (try/catch, warns and continues). | 🔶 telemetry exists, no sourcemap pipeline | If/when Lyse ships a crash-reporting opt-in, wire sourcemap upload the same "never block release" way | P3 |
| I3 | **`@dev` npm tag tracks `main` HEAD** on every successful publish (`<version>-dev.<short-sha>`), separate from `pkg-pr-new`'s **continuous per-commit preview publishes** on every push/PR (installable without any tag, CDN-style). Two distinct pre-release channels, not one. | ❌ | Add a `pkg-pr-new` step to CI (near-zero cost, every PR becomes trivially installable for review) — defer the `@dev` tag until publish volume justifies it | P2 |
| I4 | **The GitHub Action versions independently from the npm packages**, with strict `vMAJOR.MINOR.PATCH` tags + a force-moved floating `vMAJOR` alias tag (the pattern every `uses: owner/repo@v1` consumer expects). A bot posts a sticky PR comment recommending the bump level (from conventional-commit title), with an opt-in auto-tag-on-merge path (repo variable gate, not default). | 🔶 `add ci-gate` exists, no independent Action versioning | Once our GitHub Action ships (parity item B4), apply this exact scheme from day one — retrofitting Action versioning later is painful | P2 |
| I5 | CI test matrix: **Node 20.19/22.18/24/25/26** all on Ubuntu, plus Windows+macOS legs pinned to one Node version (cost-conscious: full matrix only where it's cheap). Turbo remote cache (Vercel-hosted) keyed so OS/Node legs can't replay each other's cached results. | 🔶 | Adopt the "full matrix on the free axis (Node versions), pinned matrix on the expensive axis (OS)" cost model | P3 |
| I6 | `pnpm` supply-chain hardening block: `onlyBuiltDependencies` allowlist (only 4 packages may run install scripts) + version `overrides` pinning exact ranges on security-sensitive deps. | ❌ | Copy verbatim into root `package.json` — pure security hardening, zero product cost | **P1** |

## J. Hidden/env-var/detection patterns (wave 2)

| # | Finding | Lyse | Action | Prio |
|---|---|---|---|---|
| J1 | **Granular per-cache-tier bust flags**: `REACT_DOCTOR_NO_CACHE` (everything), plus `_NO_FILE_CACHE`/`_NO_SIDECAR_CACHE`/`_NO_DEAD_CODE_CACHE` individually — lets a support conversation narrow down "which cache layer is stale" without nuking all of them. | ❌ (parity item D3, per-file cache, not yet built) | When we build the per-file lint cache (D3), ship the granular bust flags from day one — cheap, and directly useful for our own future support/debugging | P2 |
| J2 | **23-provider CI detection + 9-brand coding-agent detection**, both presence-based env-var sniffing (`CLAUDECODE`, `CURSOR_AGENT`, `CODEX_CI`, `OPENCODE`, `GOOSE_TERMINAL`, `AMP_THREAD_ID`, `CLINE_ACTIVE`, `AUGMENT_AGENT`, `TRAE_AI_SHELL_ID`, generic `AGENT_SESSION_ID`), deliberately excluding config/auth vars so a stored API key never misreports as "running inside an agent." Feeds a single `isCiOrCodingAgentEnvironment()` that suppresses all prompts/spinners. | 🔶 we detect TTY + some agents for install/handoff | Extend our env-var detection table to the same brand list — directly improves the first-run-friction work already shipped this session (no prompt fires correctly across more agent runners) | **P1** |
| J3 | `TERM=dumb` is treated as a de facto reduced-motion switch (skip cursor-escape animation) — a real, if informal, accessibility affordance. `REACT_DOCTOR_NO_COLOR`/`_FORCE_COLOR` mirror onto standard `NO_COLOR`/`FORCE_COLOR` so third-party libs (spinners, prompts) inherit the choice too. | 🔶 partial NO_COLOR handling | Add the `TERM=dumb` check and the mirror-to-standard-vars behavior — small, cheap, real accessibility win | P3 |
| J4 | OTLP telemetry export option (`REACT_DOCTOR_OTLP_ENDPOINT`/`_AUTH_HEADER`) alongside Sentry — an enterprise/observability-friendly escape hatch more open than a vendor-locked-in telemetry pipe. | ❌ N/A (no telemetry infra needing this yet) | Note for later if/when Lyse ships any opt-in scan telemetry beyond the local NDJSON log | P3 |
| J5 | `deslop-js`'s feature-flag inventory detector (10+ SDK providers: LaunchDarkly, Statsig, Unleash, GrowthBook, PostHog, ConfigCat, Flagsmith, Optimizely, Eppo, Vercel Flags) is real, on by default in `deslop-js` directly, but **silently discarded** when run via `react-doctor` itself (only 4 of ~22 fields cross the boundary) — a genuinely good detector that's underused even by its own creators. | ❌ N/A (not our domain) | No action — out of domain, but the lesson (a good detector built for one surface can rot unused if not wired into the primary product) is worth remembering as we build unused-tokens/dead-code detection (parity item D5) | ✅ (lesson noted) |

## Deliberate NON-parity (our differentiators — do not copy)

1. **Local deterministic score** vs their server-side formula (they can
   retune weights silently; we contractually cannot — sell that).
2. **Opt-in telemetry** vs their on-by-default Sentry.
3. **MCP server** — we have it, they don't.
4. **Handoff with resolved token mapping** — richer than their skill hint.
5. **Honest measurement program** (Wilson LB, corpus confirmation) — ahead
   of their liveness+fuzz on statistical rigor; keep both.
6. **Real, in-repo, open rule docs** (`docs/rules/*.md`) vs their rule docs
   living on an un-auditable system outside the OSS repo entirely, and vs
   their fully-scripted (fake) homepage demo — we can truthfully claim
   more transparency here.
7. **Honestly-labeled dual license** (AGPLv3 + Commercial, stated plainly)
   vs their "Modified MIT" that their own README mislabels as plain MIT.

## Proposed phases

- **Phase L (launch-critical, P1)**: finish instant-audit (Task 3) · top-3
  grouped by fixGroup + score projection (A4/A5) · Action full PR loop
  (B4) · share/OG/badge (B2) · leaderboard (B3) · liveness gate (E1) ·
  delta-audit baseline+nightly (E3) · dogfood PR workflow (E6) ·
  agent-install 50+ (C1) · per-file lint cache (D3) · unused-tokens rule
  family (D5) · **name the handoff model explicitly as our positioning**
  (G1) · **write the rule-authoring skill** (G5) · **xterm-emulator test
  harness** (H1) · **OIDC trusted publishing** (I1) · **pnpm supply-chain
  hardening** (I6) · **extend agent/CI env-var detection** (J2).
- **Phase 2 (agent loop)**: C2-C4, C7, A7-A11, B5, D7, E4-E5, E7-E9,
  E13-E14, F6 (release cadence), G2-G3 (tags/capability gates), G6
  (rule-candidates backlog), H4 (smoke tests), I2-I5, J1, J3.
- **Phase 3 (engine depth)**: E2 fuzz, D1 codegen/capabilities, D2/D4.
- **Phase 4 (editor)**: C5 LSP + VS Code extension (H2 reference impl).

## Wave-2 top takeaways (if you read nothing else)

1. **G1 — autofix is confirmed absent by design, and their positioning
   language for "why" is worth adopting near-verbatim**: scan →
   coding-agent fixes root cause (never suppress) → re-scan to verify.
   This is exactly `lyse handoff`. Say it as plainly as they do.
2. **F1/F2 — governance ceremony and a docs portal were NOT the growth
   lever.** No CONTRIBUTING/SECURITY/templates, no `/docs` site route, a
   fully scripted (fake) homepage demo. Don't over-invest there before
   launch; the score card + share loop + leaderboard did the work.
3. **F6/E15 corrected — their license is quietly restrictive** (AI-training
   ban + anti-SaaS clause) and their README calls it "MIT" anyway. Our
   honestly-labeled AGPL+Commercial is a real trust advantage to state
   plainly, not soften.
4. **I1/I6 — two pure-security, zero-product-cost upgrades**: OIDC
   trusted publishing (removes a long-lived npm token from CI) and pnpm
   supply-chain hardening (`onlyBuiltDependencies` + version overrides).
   No reason to wait for a phase — do these whenever CI/release work is
   next touched.
5. **H1 — the xterm-headless overflow-matrix test technique** directly
   replaces the ad-hoc tsc-sandbox verification used for `score-card.ts`
   this session with a real, CI-committed test utility.
