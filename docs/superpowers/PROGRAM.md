# Lyse — Execution Program (plan of record)

Written 2026-07-13, after the full react-doctor dissection (10 inventory
passes + 3 completeness-critic passes; see `specs/2026-07-12-react-doctor-
parity-map.md`, `specs/2026-07-13-*.md`). This document is the program I
am executing — first-person commitments with acceptance criteria, not a
backlog. The master roadmap (`specs/2026-07-13-master-roadmap.md`) is the
exhaustive item inventory; this is the ordered, ambition-calibrated cut
through it. Supersedes nothing; sequences everything.

---

## 1. Thesis (the YC-grade version)

**One-liner:** Lyse is the health score for design systems. AI agents
write most UI code now, and they break design systems by default —
hardcoded hex where a token exists, a reinvented `<Button>`, a skipped
story. Lyse measures the drift deterministically, scores it 0–100, and
hands the fixes to the same agent that caused them — then re-verifies.

**Why now.** (a) The share of agent-written UI code is exploding and the
"your agent writes bad X, this catches it" wedge is *proven* — react-
doctor rode exactly this thesis to 6k stars and ~1M-view launch in under
five months. (b) Design tokens are standardizing (DTCG), making drift
mechanically measurable for the first time. (c) No incumbent: ESLint/
Sonar don't understand design systems; Figma doesn't see code truth;
react-doctor itself scopes to React correctness, not design-system
conformance. The niche is open and adjacent to a proven playbook.

**Why us.** The hard parts are already built and are *better* than the
comparable tool's: a deterministic local score (they need a server to be
trusted; we don't), a handoff loop that already spawns coding agents with
resolved token mappings (verified at parity with their strongest
mechanism), a 70-repo benchmark corpus, an honest statistical measurement
program (Wilson lower bounds, corpus confirmation) that react-doctor has
no public equivalent of, MCP integration they lack, and genuinely open
in-repo rule docs. What's missing is not engine quality — it's finishing
the funnel, the viral loop, and the precision machinery, all of which are
specced.

**Moat, in order of durability:** (1) the precision/measurement
discipline — trust compounds and is expensive to fake; (2) the benchmark
corpus + leaderboard as the category's reference dataset; (3) the
agent-loop depth (handoff → fix → re-verify, MCP, hooks); (4) speed of
iteration with the superpowers/SDD machine.

**Business (open core, already licensed for it):** AGPLv3 + Commercial is
in place. Monetization sequence: verified scores + org leaderboard →
fleet dashboard (drift across N repos over time, the VP-of-Design view) →
enterprise policy gates (custom rules, SLAs). The Worker
(`api.getlyse.com`) already exists as the thin-SaaS substrate. Compute
stays local; the server sells *trust and aggregation*, never the scan.

## 2. Ambition targets (12 weeks post-launch, honest numbers)

React-doctor hit 6k stars in ~4 months **with a famous founder's
audience**. We calibrate without that asset — the artifact must do the
audience's job (leaderboard + score card + verified badges):

- **Launch week:** Show HN + leaderboard live with 70 scored OSS design
  systems · score-card screenshots as the shareable unit.
- **T+4 weeks:** 500+ GitHub stars, 300+ weekly npm downloads, 10+
  external leaderboard submissions (PRs), first 5 verified badges in the
  wild.
- **T+12 weeks:** 2k stars, 1.5k weekly downloads, 25+ repos running the
  GitHub Action, 3–5 design-system teams in structured design-partner
  conversations, YC application submitted with live traction numbers.

These are checkpoints, not vanity: each maps to a funnel stage (discover
→ run once → install in CI → depend on it → pay for fleet view).

## 3. How I execute (the working contract)

- **Superpowers workflow on every non-trivial change**: brainstorm →
  spec (`docs/superpowers/specs/`) → plan (`docs/superpowers/plans/`) →
  subagent-driven development (fresh implementer per task, task review
  per task, adversarial whole-branch review before merge). Ledger in
  `.superpowers/sdd/progress.md`; nothing re-executed blind after a
  context loss.
- **Verification before any claim**: rendering changes byte-verified by
  executing the real modules (moving to the `@xterm/headless` harness in
  Sprint 2); logic changes proven by executing real code; CI is the final
  gate in this npm-blocked environment — a PR is never called done until
  its checks are green.
- **The precision covenant (non-negotiable even "débridé")**: nothing
  enters the Health Score unmeasured; synthetic proof alone never
  promotes a rule; every carve-out cites the corpus miss that motivated
  it. This isn't caution — it's the moat.
- **Ship cadence**: small conventional commits, changesets on everything
  user-facing, releases at least weekly once out of alpha (react-doctor's
  102-releases lesson: visible velocity is itself a trust signal).
- **Two standing decisions stay with the maintainer** (documented
  tradeoffs, not silently made): default-on crash telemetry, and
  live-fetched agent playbooks. Everything else in this program is
  pre-approved by the "débridé" mandate.

## 4. The program

### Sprint 1 — Instant wow (the v0.3 core UX) — *in progress, resuming now*

Deliverables:
1. ~~Score card as the default audit view~~ (done, byte-verified) —
   pending its task review, dispatching now.
2. Bare `lyse` runs the audit instantly; REPL retired (plan Task 3).
3. README arc: agent-era pain → one command → screenshot → install
   (plan Task 4).
4. **Score projection on the card** — "fix the top 3 → +N pts", computed
   locally from fixGroups. The single best UX idea in react-doctor,
   and we can do it deterministically (they can't).
5. **Top findings grouped by fixGroup** — "one token clears all 40
   sites" replaces the flat top-5.
6. **Migration-scale advisory** — blast-radius per rule; ≥40-file fixes
   get "sample before you sweep" in both CLI and the handoff prompt.
7. `helpUri` serialized into `findings.json` (closes the recipe-link gap
   found in wave 3).
8. Whole-branch adversarial review → PR → CI green → merge → release.

Acceptance: a first-run user goes from `npx @lyse-labs/lyse` to a
screenshot-worthy card with a projected gain in under 30 seconds, zero
prompts; the PR merges with all required checks green.

### Sprint 2 — The precision machine (the moat)

1. **Liveness gate** — every rule fires on a canonical fixture or is
   allowlisted with a reason; CI-enforced. (First, it's a day.)
2. **`@xterm/headless` rendering harness** — width-matrix overflow tests
   replace the ad-hoc sandbox verification permanently.
3. **Centralized FP-suppression tags** in `_rule-module.ts` (test-file
   skip, dsSelfMode, and the `migration-hint` inversion) — one audit
   pass consolidating what 66 rules hand-roll today.
4. **Real-shape fuzzing**: corpus-seeded generators (mutate real bench
   snippets, not grammar), 4 oracles including verdict-drop — pointed
   first at the token rules whose 90%-synthetic/65%-real gap we already
   measured.
5. **fn-mining** over token + a11y rules (recall-side complement).
6. **Delta-audit nightly** with committed baseline + dead-rule/spike
   gates (the infra is ~90% built).
7. **"Deslop for tokens" rule family**: unused tokens, unused DS
   components, duplicate tokens (same value, two names), circular
   aliases — confidence-tiered. The killer missing family; likely the
   single most demo-able feature for design-system leads.
8. `prefers-reduced-motion` rule (motion library present, no reduced-
   motion handling anywhere) — on-domain, cheap, real.
9. Publish `docs/superpowers/rule-candidates-backlog.md` from the
   measurement data.

Acceptance: the fuzz harness demonstrably catches a seeded precision
regression that synthetic fixtures miss; nightly delta-audit runs green
3 consecutive nights; the token-hygiene family ships measured (or
honestly `experimental`).

### Sprint 3 — Distribution engine

1. **GitHub Action, full loop**: sticky PR comment, inline review
   comments on changed lines with rule-doc links, commit status
   "Lyse: 71/100", job summary, advisory-by-default, baseline
   `fixed-issues` output; independent semver from day one.
2. **`lyse install` at react-doctor depth**: agent-install into 50+
   clients, npm script, devDep, workflow, pre-commit (9 hook managers),
   `--dry-run`, remembered choices; native post-edit hooks for Claude
   Code/Cursor.
3. `--no-respect-inline-disables` audit mode; `--project` monorepo
   selection; `validateModeFlags`; extended CI/agent env detection.
4. OIDC trusted publishing + pnpm hardening + pkg-pr-new previews +
   smoke-test layer (packed-install, real-pty prompt, published-deps
   guard) — the standing-infra batch, done once while CI is open.

Acceptance: a PR to a repo with the Action shows the score card comment
+ inline findings within one CI run; `lyse install --dry-run` correctly
plans on a cold repo for ≥6 agent clients.

### Sprint 4 — The launch

1. **Leaderboard**: `leaderboard.json` in lyse-bench (70 DS at pinned
   SHAs, scored in CI), page on getlyse.com, add-your-DS-by-PR loop.
2. **Share loop**: /share page, dynamic OG card, dynamic badge SVG +
   copy snippet, tweet/LinkedIn intents, share URL in the CLI footer.
3. **Verified score**: `POST api.getlyse.com/v1/verify-score` — server
   recomputes from the same open formula, returns a signed token;
   required for verified badges/leaderboard, never for local audits.
4. Scripted homepage demo (honestly labeled), llms.txt, stable schema
   URL.
5. Launch assets: Show HN post, launch thread (score-card screenshots +
   leaderboard hooks: "shadcn/ui scores 74. Your DS?"), 90-second demo
   video script, README final pass.
6. **Dogfood in public**: Lyse's own score on its own README via the
   verified badge, plus a published self-audit.

Acceptance: launch-day kit complete and rehearsed; leaderboard live with
70 entries; badge → share page → npx funnel measured end-to-end.

### Sprint 5 — Enterprise wedge + YC pack

1. **Fleet view spec** (brainstormed properly): multi-repo drift over
   time on the Worker — the artifact a design-system lead shows their VP.
   Spec + design partner interviews before code.
2. Verified-badge adoption push with the first external teams.
3. **YC application pack**: one-liner, traction table (live numbers from
   Sprint 4), demo video, "why now" narrative, founder story, competitive
   table (react-doctor validates the category; we own the design-system
   axis they structurally can't cover without rebuilding their engine).
4. Pricing skeleton on COMMERCIAL.md's existing dual-license frame.

### Sprint 6 — The editor frontier (start of the next arc)

1. LSP spike (stdio daemon, pull diagnostics, quick-fix-as-suppression,
   status-bar score) → VS Code extension MVP.
2. Oxlint-host spike for the JSX-side rules — prototype-then-decide, per
   the maximal-reuse spec's explicit warning about this lift.

## 5. Honest constraints I am managing around

- **This environment cannot run vitest** (npm registry blocked): local
  proof is by executing real modules through harnesses; CI gates every
  merge. If a SessionStart hook or trusted-network environment becomes
  available, suite runs move local and everything accelerates.
- **Scoring-contract changes** (retiring axes, promoting rules — Phase B
  of the socle program) ride behind the precision machine (Sprint 2) and
  their own ADRs; nothing in Sprints 1–4 moves any repo's score.
- **Solo maintainer + agent leverage**: the SDD machine (fresh
  implementer subagents + per-task review + adversarial final review) is
  how one person ships at multi-engineer cadence without the quality
  collapse that normally implies. It stays mandatory even under time
  pressure — especially under time pressure.

## 6. What happens the moment this document lands

1. Task-2 reviewer dispatched (the pipeline un-pauses).
2. Tasks 3–5 of the current plan execute sequentially (instant audit,
   README arc, whole-branch review).
3. Sprint 1 items 4–7 get their brainstorm-lite spec + plan, then SDD
   execution.
4. PR opened when the branch review is clean and CI is green.
