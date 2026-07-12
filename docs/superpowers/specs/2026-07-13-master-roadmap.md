# Master roadmap — consolidated from the react-doctor research

Single source of truth consolidating (deduplicated, phased):
- `2026-07-12-react-doctor-parity-map.md` (88 items, sections A-L)
- `2026-07-13-maximal-reuse-aggressive-posture.md` (entorses, sections I-IV)
- `2026-07-13-how-react-doctor-gets-precision-at-scale.md` (14 mechanisms)
- **Wave-3 completeness-critic pass** (2026-07-13): 3 agents re-read the
  full CLI (`packages/react-doctor/src/cli/**`, every file), the engine
  internals not yet cross-referenced (`packages/core/src/{services,
  project-info,checks,utils}`, the oxlint plugin's config/surface-merge
  chain, `deslop-js/src/report/*`), and verified Lyse's own `lyse
  handoff` against react-doctor's agent-spawn mechanism directly in this
  repo's code — specifically to answer "is there truly nothing left."
  30 net-new findings folded in below (marked 🆕), 2 confirmed already at
  parity (marked ✅ **parity confirmed**).
- Current execution state: `docs/superpowers/plans/2026-07-12-score-card-and-instant-audit.md`

Status legend: ✅ done this session · 🔸 in flight, paused · ☐ backlog · 🆕 wave-3 finding.

## Already at parity — confirmed by direct code inspection (wave 3)

- ✅ **Direct agent-CLI spawn with permission bypass.**
  `packages/core/src/agent/launch.ts` already spawns `claude`/`codex`/
  `cursor-agent` directly with the same class of bypass flags react-doctor
  uses (`--dangerously-skip-permissions`, `--yolo`, `--force`), documented
  as a named trust boundary in `PRIVACY.md`. React-doctor's residual edge
  (worth a small follow-up, not a rebuild): a clipboard-copy fallback
  chain (`pbcopy`/`wl-copy`/`xclip`/`xsel`/`clip`) and explicit Windows
  `.cmd`-wrapper resolution for one agent (Cursor) — check `launch.ts`
  covers both before assuming full parity.
- ✅ **OSC 8 clickable terminal hyperlinks.** `terminal-format.ts` already
  wraps rule-doc and `file:line` links in OSC 8 escapes (`OSC_OPEN`/
  `OSC_CLOSE`). No action.

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
- 🆕 ☐ **Small gap found in `lyse handoff`**: `Finding.helpUri` is threaded
  into the agent-facing *prompt text* (`agent/payload.ts`) but dropped
  before `findings.json` is serialized (`agent/handoff.ts`) — any
  downstream tool consuming the JSON artifact directly loses the
  canonical fix-recipe link the prompt-reading agent gets. Add `helpUri`
  to the serialized `Finding` shape.

## Phase 1 — the wow moment, finished

- ☐ **Score projection**: "fix these 3 findings → +N points" computed
  locally and deterministically from existing `fixGroup` data.
- ☐ **Top findings grouped by fixGroup/rule** with a "one token clears
  all N sites" line, replacing the current flat top-5.
- ☐ **Lyse mascot/expressive glyph** (score-band-keyed expression on the
  existing `◈` brand mark or a new one) — cheap, memorable.
- ☐ **Scripted homepage demo** on getlyse.com (clearly illustrative, same
  technique as react-doctor's, honestly labeled).
- 🆕 ☐ **Migration-scale advisory** — genuinely bigger than the "top
  findings grouped by fixGroup" item above: a per-rule "blast radius"
  (site count + distinct file count) classifies any fix touching ≥N files
  (their threshold: 40, itself recalibrated from production telemetry —
  ship a config-overridable constant, tune later) as a migration, not a
  quick fix. Surfaces two ways: a CLI advisory ("sample before you
  sweep") AND — the higher-value half — an explicit instruction spliced
  into the `lyse handoff` prompt telling the agent to fix a representative
  sample, confirm the recipe holds, and defer the rest rather than
  blindly mass-editing 40+ files in one shot.

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
  🆕 Include a third tag semantics react-doctor has and the earlier note
  didn't: a `migration-hint`-equivalent tag that **inverts** the
  test-file-skip default (a deprecated-API/legacy-pattern rule should
  still fire inside fixtures/tests, since those are exactly what needs
  migrating) — tag interactions can override, not just add.
- 🆕 ☐ **`prefers-reduced-motion` audit rule** — a real candidate rule,
  not just an engineering pattern: flag a project that depends on a
  motion/animation library (or defines `tokens/motion` values) but has no
  `prefers-reduced-motion` handling anywhere in source. Fits Lyse's
  existing `tokens/no-hardcoded-motion` neighborhood and a11y axis
  directly — genuinely on-domain, unlike most of react-doctor's other
  project-doctor checks (Expo/RN config, RSC CVE advisories) which are
  React/mobile-specific and don't transfer.
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
- 🆕 ☐ **Workspace-wide share opt-out aggregation**: in a monorepo scan,
  suppress the aggregate share URL if *any* scanned project's config
  opts out (`noScore`/`share: false`) — one package's privacy preference
  protects the whole run, not just a root-level flag. A specific
  precedence rule to get right when the share feature (above) ships.
- 🆕 ☐ **Auto-pin migration for Lyse's own GitHub Action** (once it
  ships): detect an unpinned `@main`/`@master` reference to
  `lyse-labs/lyse-action` in the *user's* workflow files and offer to
  rewrite it to the pinned floating major (`@v1`) — a proactive
  supply-chain fix applied to consumer repos, not just our own release
  engineering.

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
- 🆕 ☐ **`--no-respect-inline-disables` (audit mode)** — neutralize inline
  suppression comments before scanning, so `// lyse-disable-next-line`
  added specifically to hide a hardcoded color from an audit can't. High
  value, near-verbatim copy: this is exactly the failure mode a
  drift-audit tool must catch.
- 🆕 ☐ **`--warnings`/`--no-warnings` display toggle**, with the general
  precedence rule: any flag that *gates* CI on a severity tier must force
  that tier visible even over an explicit display-suppression flag
  (`--blocking warning` overrides `--no-warnings` — you can't block on
  what you've hidden).
- 🆕 ☐ **`--output-dir` full diagnostics dump** (one file per rule +
  `diagnostics.json`), with reuse-safe cleanup: on a reused directory,
  read the *previous* run's manifest to know exactly which files this
  tool itself wrote, and remove only those — never guess by filename
  shape. Useful for CI artifact upload on large audits.
- 🆕 ☐ **`--json-compact` / `--json-out <path>`** output refinements, plus
  a hardcoded last-resort fallback JSON string so `--json` mode is
  *always* valid JSON even if the report builder itself throws.
- 🆕 ☐ **`--project <name>` monorepo/workspace selection**, fully worked
  out: comma-separated names or arbitrary paths, a `*` sentinel for "all
  discovered projects" (what a CI action should pass by default),
  resolution order (workspace name → dir basename → root basename →
  relative path) with a clear error listing available names on miss, a
  persistent `projects` config-file form, and an interactive multiselect
  when >1 package is found. Design-system component-library monorepos
  need this identically.
- 🆕 ☐ **`validateModeFlags`-style mutual-exclusivity check**: one
  early pass that rejects incompatible flag combinations with a clear
  message (e.g. "`--score` needs the telemetry `--no-score` just turned
  off") instead of silently picking one or producing confusing behavior.
  A reusable pattern worth adopting as Lyse's own flag surface grows.
- 🆕 ☐ **Config precedence chain, spelled out exactly** (not just "flags
  override config"): new-flag-name > deprecated-flag-alias > new-config-
  key > deprecated-config-alias — the new name always wins over its own
  deprecated alias on *both* sides before cross-source precedence even
  applies. Relevant the next time a Lyse flag/config key is deprecated.
- 🆕 ☐ **Prompt-cancel exits 0, not the SIGINT 130.** A user backing out
  of an interactive question (Esc) is not an error and should not share
  an exit code with a killed process — small but easy to get wrong.

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
  fast repeat audits. 🆕 **Build it as a 4-tier design from day one**,
  not 3: react-doctor's actual architecture adds a whole-scan-result
  cache on top of per-file/sidecar/dead-code, keyed on HEAD SHA plus a
  git-status-derived "dirty worktree fingerprint" (content-hashes
  uncommitted/untracked files, falls back to `mtime:size` above a size
  threshold, and separately hashes gitignored `.env*` files a git-status
  diff would miss), a toolchain-version fingerprint, an independent
  manifest-content-hash replay guard (so a keying bug degrades to a
  cache miss, never serves another project's stale diagnostics), and a
  schema-version bump that discards the whole cache wholesale on shape
  changes. Worth designing this way the first time rather than adding a
  4th tier later.
- ☐ **Independent GitHub Action semver versioning** (once the Action
  ships) — strict tags + floating major alias, auto-bump-recommendation
  bot on PR.
- 🆕 ☐ **Generalize onboarding/growth nudges into a gates+migrations
  framework**: one persisted-state store, organized as independently-
  versioned **gates** (fire-once prompts/reveals, scoped global or
  per-repo) and **migrations** (one-shot config/repo rewrites), each
  reversioned without touching the others, with forward-compatible
  handling (a newer on-disk schema is never migrated down by an older
  binary). Prevents every new nudge (CI pitch, install hint, config
  rename) from becoming a bespoke one-off flag as Lyse adds more of them.

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
- 🆕 ☐ **Implementation note for whenever the LSP ships**: register the
  LSP subcommand in the CLI parser purely so `--help` lists it, but fast-
  path real dispatch to a dedicated entry point *before* the interactive-
  prompt machinery ever touches stdin — the stdio LSP transport and a
  TTY prompt library fight over the same stream otherwise.

## Phase 8 — bigger-than-expected: a security/hygiene rule axis (new scope, evaluate separately)

Wave-3 found an entire ~45-rule "security-scan" family running through a
**separate whole-tree file-scanning engine** (not the normal AST-visitor
path) — secret/env leaks in build artifacts, injection risk classes,
BaaS-misconfiguration checks (Firebase/Supabase), JWT/session/webhook
risk patterns. This is genuinely outside every phase above — it's a new
axis, not a refinement of the drift-detection domain. Also found:
`deslop-js`'s complexity/cognitive-complexity, TypeScript-smells,
DRY-pattern, private-type-leak, and cross-file-duplicate-export detectors
— broader than the "unused/duplicate tokens" family already in Phase 2,
closer to general code-hygiene for a design-system *package's own source*
(e.g. a leaked private type in a DS component's public export surface,
an overly complex component). **Not scheduled** — flagging its existence
and scope honestly rather than folding it into Phase 2's token-focused
scope, since design-system "security/hygiene" (secrets in Storybook
config, leaked internal types from a component library's public API)
is a plausible-but-unvalidated future axis, not yet a specced project.

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
