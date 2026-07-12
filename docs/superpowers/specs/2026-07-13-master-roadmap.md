# Master roadmap — consolidated from the react-doctor research

Single source of truth consolidating (deduplicated, phased):
- `2026-07-12-react-doctor-parity-map.md` (88 items, sections A-L)
- `2026-07-13-maximal-reuse-aggressive-posture.md` (entorses, sections I-IV)
- `2026-07-13-how-react-doctor-gets-precision-at-scale.md` (14 mechanisms)
- Current execution state: `docs/superpowers/plans/2026-07-12-score-card-and-instant-audit.md`

Status legend: ✅ done this session · 🔸 in flight, paused · ☐ backlog.

## Phase 0 — finish what's already in flight

- ☐ **Task 2 review** (score card composed into `renderTerminal`) — commit
  `f73b834` shipped and byte-verified, task-reviewer dispatch was paused
  mid-pipeline, not yet run.
- ☐ **Task 3** — bare `lyse` runs the audit instantly, retire the
  standalone REPL menu (spec written, plan task written, not started).
- ☐ **Task 4** — README restructure: agent-era pain paragraph + instant
  quickstart (spec written, not started).
- ☐ **Task 5** — whole-branch adversarial review of the score-card +
  instant-audit branch, before merge.
- ✅ Score-card renderer (`score-card.ts`), byte-verified.
- ✅ Wave-1 DX: #226 fix, no-prompt-before-score, six-axes display parity,
  tagline, superpowers skills vendored.

## Phase 1 — the wow moment, finished

- ☐ **Score projection**: "fix these 3 findings → +N points" computed
  locally and deterministically from existing `fixGroup` data.
- ☐ **Top findings grouped by fixGroup/rule** with a "one token clears
  all N sites" line, replacing the current flat top-5.
- ☐ **Lyse mascot/expressive glyph** (score-band-keyed expression on the
  existing `◈` brand mark or a new one) — cheap, memorable.
- ☐ **Scripted homepage demo** on getlyse.com (clearly illustrative, same
  technique as react-doctor's, honestly labeled).

## Phase 2 — precision infrastructure (the highest-leverage, most novel work)

This directly targets the measured gap: `tokens/no-hardcoded-color` at
90% synthetic / 65% real; two other rules at 90% synthetic / 22-6% real.

- ☐ **Fuzz corpus seeded from real code shape** (not hand-written
  adversarial grammar) — mutate real fixture/corpus/agent-produced
  snippets; add a verdict-drop oracle (silenced-rule = false-negative
  evasion) over the existing rule set. **Single highest-leverage item.**
- ☐ **Liveness gate**: every registered rule must fire on one canonical
  bad fixture or be explicitly allowlisted with a reason, enforced in CI.
- ☐ **fn-mining**: generate syntactic variants near each rule's decision
  boundary, report which don't fire, for human triage.
- ☐ **Delta-audit promoted to nightly + committed baseline** (cron,
  dead-rule / spike thresholds) — ~90% of the infra already exists
  (`.bench-corpus/`, the measurement harness).
- ☐ **Centralize cross-cutting false-positive suppression** (dsSelfMode
  checks, test-file skipping, etc.) into `_rule-module.ts` via
  declarative tags instead of each of the 66 rules hand-rolling its own.
- ☐ **Publish a rule-candidates backlog** from the measurement-report's
  own findings (cheap — the evidence already exists).
- ☐ **Opt-in real-world feedback loop**: which findings get
  suppressed/fixed vs. ignored on real `lyse audit` runs, feeding back
  into the corpus at far lower cost than manual curation (builds on the
  existing NDJSON local-log + telemetry consent infra).
- ☐ **New rule family — "deslop for tokens"**: unused tokens, unused DS
  components, duplicate tokens (same value, two names), circular token
  aliases. A genuinely missing rule family, not a cosmetic add.
- ☐ **Capability-gated rule activation** (`requires`/`disabledWhen`
  tokens in rule meta) — precision bought at the registry layer.
- ☐ **Rule-authoring skill**, written up properly
  (`.claude/skills/lyse-rule-authoring/`): codifies the "socle" process
  that already exists informally.

## Phase 3 — distribution & the viral loop

- ☐ **Leaderboard** on the 70-repo lyse-bench corpus, `leaderboard.json`
  + a page, "add your DS by PR" loop.
- ☐ **Share page + dynamic OG card + badge SVG + copy-snippet + tweet/
  LinkedIn share buttons.**
- ☐ **Opt-in "verified score"**: a narrow endpoint on the existing
  `api.getlyse.com` Worker that recomputes the score server-side from the
  same open formula and returns a signed token, required only for
  `--verified` badges / leaderboard submissions. Plain local audits stay
  exactly as private as today — this closes the "anyone can fork and
  hardcode 100" hole a public leaderboard opens.
- ☐ **GitHub Action, full loop**: sticky PR comment, inline review
  comments on changed lines (rule-doc links), commit status, job
  summary, advisory-by-default, `fixed-issues` baseline output.
- ☐ **Install into 50+ agent clients** (`agent-install`-style), curated
  default set, remembered choice, `--dry-run`.
- ☐ **Native post-edit agent hooks** (Claude Code/Cursor): non-blocking
  re-scan after the agent edits files.

## Phase 4 — full CLI surface parity

- ☐ `lyse why <file>:<line>` — explain a finding or a suppression.
- ☐ `lyse rules list/explain/set/enable/disable/category/ignore-tag` —
  edit `.lyse.yaml` from the CLI.
- ☐ `--staged`, `--scope lines`, `--max-duration <s>`, `--blocking
  <error|warning|none>` as the primary CI gate (alongside/superseding
  the current score-threshold gate).
- ☐ Extended CI/agent environment detection (23 CI providers + 9 agent
  brands via presence-based env vars) — improves the already-shipped
  no-prompt-before-score work across more runners.
- ☐ `TERM=dumb` reduced-motion switch; mirror app-specific `NO_COLOR`/
  `FORCE_COLOR` overrides onto the standard vars.

## Phase 5 — engineering rigor (mostly invisible, still necessary)

- ☐ **OIDC npm Trusted Publishing** — removes a long-lived npm token
  from CI secrets entirely.
- ☐ **pnpm supply-chain hardening** (`onlyBuiltDependencies` allowlist,
  version `overrides` pinning) — copy verbatim, zero product cost.
- ☐ **`@xterm/headless` test harness** for terminal rendering — replaces
  the ad-hoc tsc-sandbox verification used for `score-card.ts` this
  session with a real, CI-committed test utility, width-matrix tested.
- ☐ **Smoke test suite**: packed-npm-install (no forbidden transitive
  deps land), a real-pty TTY-prompt test, "published deps must be
  declared" regression guard, JSON-report-shape smoke test.
- ☐ **Per-file lint cache** with granular cache-bust flags
  (`--no-file-cache`/`--no-sidecar-cache`/`--no-dead-code-cache`) for
  fast repeat audits.
- ☐ **Independent GitHub Action semver versioning** (once the Action
  ships) — strict tags + floating major alias, auto-bump-recommendation
  bot on PR.

## Phase 6 — the long frontier (name it, don't schedule it yet)

- ☐ **LSP + VS Code/Zed extensions**: drift diagnostics while typing, not
  just at audit time. The single biggest remaining "must-have product"
  lever. Reuse the stdio-LSP-daemon architecture (pull diagnostics,
  quick-fix-as-suppression, status-bar spinner, prefilled-issue false-
  positive reporting).
- ☐ **Spike (not commit): JSX/TSX rule execution on a Rust-hosted plugin
  engine** (oxlint or similar) instead of Lyse's own Babel/AST traversal
  — would speed up `components/*`/`naming/*`/`stories/*`/`a11y/*` rules
  and let Lyse inherit oxlint's own upstream a11y/hooks rule ports
  instead of wrapping ESLint in-process. CSS/token-value rules stay on
  Lyse's own parser regardless (no oxlint-plugin equivalent exists for
  them). The largest, riskiest item in this whole roadmap — deserves its
  own brainstorm + prototype before any scheduling commitment.

## Phase 7 — positioning (docs/messaging only, no code)

- ☐ Say the handoff model as plainly as react-doctor says theirs: scan →
  coding agent fixes the root cause (never suppresses) → re-scan to
  verify. This is `lyse handoff`, already built — it just needs to be
  named this directly in the README/pitch.
- ☐ State the honest-license and open-docs advantage plainly (AGPL +
  Commercial, clearly labeled, vs. their "Modified MIT" mislabeled as
  plain MIT in their own README; real in-repo `docs/rules/*.md` vs. their
  rule docs living outside the OSS repo entirely).

## Explicitly deferred, tradeoff named (revisit only with explicit sign-off)

- **Default-on crash telemetry** — reconsiders `PRIVACY.md`/`CLAUDE.md`'s
  "no telemetry-by-default" commitment. Recommendation on record: don't
  flip the default; instead offer to attach a sanitized crash report
  (never scan content) automatically at the moment of an actual crash.
- **Remote-fetched, server-updatable agent playbook** — ship pinned by
  default (current behavior); offer `--live-playbook` as an explicit
  opt-in fetch, never silent.

## Not planned at all (deliberately different, no action)

MCP server (already ahead), richer handoff with resolved token mapping
(already ahead), the honest-measurement program itself (already more
rigorous in spirit than react-doctor's liveness+fuzz — Phase 2 above
gives it the operational machinery to match, not to replace it).
