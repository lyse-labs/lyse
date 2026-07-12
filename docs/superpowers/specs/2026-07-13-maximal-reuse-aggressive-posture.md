# Maximal react-doctor reuse for Lyse — aggressive posture

Follows `2026-07-12-react-doctor-parity-map.md` (88 items, sections A-L).
That map filtered ideas through "keep our differentiators." This doc
removes the filter: **everything** react-doctor does, transposed 100% to
design systems, organized by how much it costs to adopt — and, for the
handful of items that touch an already-written commitment (`PRIVACY.md`,
`CLAUDE.md`), the exact commitment named so the call stays informed, not
silently made.

## I. Pure copy, zero conflict — adopt without debate

Everything in parity-map sections A (funnel/UX), B (score/viral loop), C
(agent loop, minus C2), part of D (engine, minus none flagged here), E
(internal plumbing), G, H, I, J is a straight win: no existing Lyse
commitment says anything that conflicts with a score-projection ghost, a
mascot, `lyse why`, a `rules` command group, a liveness gate, a fuzz
harness, OIDC publishing, or an xterm-headless test rig. These aren't
"entorses" — they were never blocked by anything. Full list already in
the parity map; the top 12 by leverage:

1. **Score card + projection ghost** ("+8 pts if you fix these 12 colors") — already in flight (score-card.ts).
2. **Top findings grouped by fixGroup**, "one token clears all N sites."
3. **`lyse why <file>:<line>`** — explain a finding or a suppression.
4. **`lyse rules list/explain/set/enable/disable/category/ignore-tag`** — edit `.lyse.yaml` from the CLI.
5. **Bare `lyse` scans instantly** (Task 3, paused) — zero-config first command.
6. **GitHub Action full loop**: sticky PR comment, inline review comments on changed lines, commit status, job summary, advisory-by-default.
7. **Leaderboard** on the 70-repo lyse-bench corpus, PR-to-add-your-DS loop.
8. **Share page + dynamic OG card + badge SVG + tweet/LinkedIn intents.**
9. **`agent-install`-style install into 50+ agent clients**, remembered choice, `--dry-run`.
10. **Liveness gate** (every rule must fire on a canonical fixture or be allowlisted with a reason).
11. **Fuzz harness, 4 oracles** (crash / slow / metamorphic invariant / verdict-drop) over token + a11y rules.
12. **Delta-audit nightly** against a pinned baseline on the bench corpus (~90% of this already exists).

Also pure-copy, smaller but real: `--staged`, `--scope lines`, `--max-duration`, `--blocking <level>`, native post-edit agent hooks, `pnpm` supply-chain hardening, OIDC trusted publishing, per-file lint cache with granular cache-bust flags, extended CI/agent env-var detection (23 CI providers + 9 agent brands), `TERM=dumb` reduced-motion, independent GitHub Action semver versioning with an auto-bump-recommendation bot, `rule-candidates-backlog.md` published openly, the 3-stage rule-authoring skill (`rule-research` → `rule-writing` → `rule-validate`).

## II. Domain transposition — 100% react-doctor, translated

- **Mascot.** Not a copied face — a Lyse-native expressive glyph. Candidate: the `◈` brand mark already in the banner, with 3 expressions (bright/dim/broken) keyed to score band, or a literal paint-swatch/drop character. Cheap, memorable, on-brand — the same bet as their doctor-face, played on our own identity.
- **"deslop" for design systems.** Their dead-code detector (unused files/exports/deps, circular imports, confidence-tiered) becomes: **unused tokens** (defined, never referenced), **unused DS components** (exported, never imported), **duplicate tokens** (same resolved value under two names), **circular token aliases**. This is a genuinely missing rule family, not a cosmetic addition — implement as its own module (`src/dead-tokens/` or similar), mirroring deslop-js's architecture (graph/reachability over the token map + component inventory, confidence tiers on findings).
- **Scripted homepage demo.** Their `/` terminal animation is 100% fake (hardcoded diagnostics array). Legitimate, cheap conversion asset — build the equivalent on getlyse.com, clearly it's illustrative, not a live scan (no misrepresentation, same technique).
- **LSP + VS Code/Zed extensions.** The furthest frontier (phase 4) but the most "incontournable" one: a Lyse LSP means drift diagnostics appear **while the agent or human is typing**, not just at audit time. Reuse their exact architecture (stdio LSP daemon, pull diagnostics, quick-fix-as-suppression, `experimental/serverStatus` spinner, `reportFalsePositive` → prefilled GitHub issue). This is the single biggest "must-have product" lever left on the table.

## III. The real entorses — items that touch a written commitment

These are the ones worth stopping on, because `PRIVACY.md`/`CLAUDE.md`
currently say something specific that a naive full-copy would break.
Each is presented as a genuine option with the tradeoff named — not
pre-decided.

### III.1 — An opt-in "verified score" via the existing Worker (reconsiders NON-parity #1)

**What they do:** the score is computed server-side (`SCORE_API_URL`); the
client never gets to assert its own number.

**Why it's worth reconsidering, not just copying:** a 100%-local score has
a real weakness once a public leaderboard and shareable badges exist (both
now in scope, section I above): **nothing stops a fork from hardcoding
`finalScore: 100`** before generating a badge or a leaderboard submission.
react-doctor's server-side score exists largely to make badges/leaderboard
entries **trustworthy** — the exact property Lyse will need the moment the
leaderboard ships.

**The move that doesn't break anything:** this is not actually a
principle violation — `CLAUDE.md` already names the Worker as the "Thin
SaaS" layer ("handles identity, billing, aggregation. Compute stays in
the CLI") and `api.getlyse.com` already exists. Add a **narrow, opt-in**
endpoint: `POST api.getlyse.com/v1/verify-score` takes the finding-level
JSON (not source code — the audit output already strips file content),
recomputes the score server-side from the deterministic public formula,
and returns a signed token. `lyse badge --verified` / a leaderboard
submission require that token; a plain local `lyse audit` never calls it
and stays exactly as private as today. **This keeps "same input → same
score" true (the server runs the identical open-source formula) while
adding the one thing local-only scoring can't provide: proof the score
wasn't hand-edited.** Genuinely additive, not a retreat from
determinism — worth doing.

### III.2 — Default-on crash telemetry, separate from content telemetry (reconsiders NON-parity #2, partially)

**What they do:** Sentry crash/usage telemetry is on by default (CLI
version, platform, Node version, framework, rule-fired names/counts,
de-minified stack traces), opt-out via `--no-telemetry`.

**The written commitment this touches:** `CLAUDE.md:117` — *"No
telemetry-by-default. No surprise network calls."* `PRIVACY.md`'s whole
first-run-prompt design exists specifically so telemetry is never on
without an explicit yes.

**The honest tradeoff:** default-on crash reporting is a real operational
upgrade for an alpha product — debugging "it crashed on someone's machine
in Tokyo" without a stack trace is genuinely harder than it needs to be.
But flipping ANY telemetry to default-on is a direct reversal of a
promise stated in two docs and demonstrated in the just-shipped Wave-1
work (which specifically moved consent prompts to protect this
guarantee). **Recommendation if this is wanted: keep it opt-in, but make
the ask higher-value and easier** — e.g. an *automatic* offer to attach a
sanitized crash report (stack trace + versions, never scan content) the
moment a run actually crashes, rather than a generic upfront yes/no. That
gets 90% of the debugging value without touching the "no telemetry
without an explicit yes" line. Flipping the default is possible but
should be a deliberate, documented decision — not a side effect of
"maximal reuse."

### III.3 — The remote-fetched, server-updatable agent playbook (reconsiders parity-map C2)

**What they do:** the installed skill is a thin pointer; the real
instructions are fetched at runtime from `react.doctor/prompts/*.md`, so
updating the prompt server-side updates every installed agent on its next
run, no reinstall.

**The tension:** `CLAUDE.md:117`'s "no surprise network calls" is about
the *audit* path, not the *install* path — but a skill that phones home
on every agent invocation is still a meaningful shift from "the CLI you
installed is the CLI that runs."

**The move that keeps both properties:** ship the playbook **pinned by
default** (current behavior, fully offline once installed) and add
`lyse install --live-playbook` as an explicit opt-in that fetches
`getlyse.com/prompts/handoff.md` on each invocation. Same server-side
update capability they have, same trust posture we already promise —
opt-in instead of default. This is the general pattern for every item in
this section III: **take the capability, keep the consent gate.**

## IV. The heavy engineering entorse worth naming explicitly

**Move JS/TSX rule execution onto a Rust-hosted plugin engine (oxlint or
similar), instead of Lyse's own hand-rolled Babel/AST traversal.**

Their entire 400-rule engine is JS plugins hosted inside the real oxlint
binary (Rust) — parsing/traversal is Rust-fast, only the rule logic is
JS. Lyse's component/a11y/naming/stories rules (everything that isn't
CSS/token-value matching) are exactly the shape of rule that could run
the same way: `components/no-arbitrary-tailwind`, `components/no-native-
shadows`, `naming/*`, `stories/*`, and `a11y/essentials` (which already
wraps `eslint-plugin-jsx-a11y` in-process — could instead consume
oxlint's own faster ports of the same rules).

**This is the biggest, riskiest item in this whole document** — a real
architecture migration, not a feature add. It would not touch CSS/token
rules (those have no oxlint-plugin equivalent; they'd stay on Lyse's own
CSS parser) but could meaningfully speed up the JSX-side rules and let
Lyse inherit oxlint's own upstream a11y/hooks rule quality instead of
wrapping ESLint. Flag it, don't schedule it — it deserves its own
brainstorming pass with a real spike/prototype before any commitment,
given the size of the lift versus the current TS pipeline's maturity.

## What stays deliberately different (the list that survives even under "maximal reuse")

Everything in the parity map's original "Deliberate NON-parity" items 3,
4, 5, 6, 7 (MCP server, richer handoff, honest measurement program, real
in-repo docs, honestly-labeled dual license) has no react-doctor
equivalent to copy from and no tension to resolve — they're just ahead.
Nothing above argues for touching them.
