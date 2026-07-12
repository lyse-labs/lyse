# React-doctor parity map — everything they have, applied to Lyse

Source: full-repo dissection of `millionco/react-doctor` (4 parallel
inventories: CLI surface, engine, distribution, internal plumbing),
2026-07-12. Status legend: ✅ Lyse has it · 🔶 partial · ❌ missing.
"Domain-adapted" means translated to design-system drift, not copied.

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
| E15 | License: AI-training gate → founders@; enterprise URL | ✅ AGPL+commercial | Add enterprise contact URL | P3 |

## Deliberate NON-parity (our differentiators — do not copy)

1. **Local deterministic score** vs their server-side formula (they can
   retune weights silently; we contractually cannot — sell that).
2. **Opt-in telemetry** vs their on-by-default Sentry.
3. **MCP server** — we have it, they don't.
4. **Handoff with resolved token mapping** — richer than their skill hint.
5. **Honest measurement program** (Wilson LB, corpus confirmation) — ahead
   of their liveness+fuzz on statistical rigor; keep both.

## Proposed phases

- **Phase L (launch-critical, P1)**: finish instant-audit (Task 3) · top-3
  grouped by fixGroup + score projection (A4/A5) · Action full PR loop
  (B4) · share/OG/badge (B2) · leaderboard (B3) · liveness gate (E1) ·
  delta-audit baseline+nightly (E3) · dogfood PR workflow (E6) ·
  agent-install 50+ (C1) · per-file lint cache (D3) · unused-tokens rule
  family (D5).
- **Phase 2 (agent loop)**: C2-C4, C7, A7-A11, B5, D7, E4-E5, E7-E9, E13-E14.
- **Phase 3 (engine depth)**: E2 fuzz, D1 codegen/capabilities, D2/D4.
- **Phase 4 (editor)**: C5 LSP + VS Code extension.
