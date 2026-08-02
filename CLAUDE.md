# Lyse — Project Instructions

Project context, conventions, and overrides for AI assistants working in this repository.

## Project at a glance

Lyse is an open-source design system drift scanner.

- **packages/core** — the `@lyse-labs/lyse` npm package (CLI binary `lyse`): library, MCP server, codemods, rules engine.
- **docs/** — public, user-facing and contributor-facing documentation.

The companion benchmark corpus (70 OSS design systems) lives in the separate
public repository [`lyse-labs/lyse-bench`](https://github.com/lyse-labs/lyse-bench)
(CC BY 4.0).

A separate private repository (`lyse-labs/lyse-internal`) holds the
Cloudflare Worker that powers `api.getlyse.com` and internal engineering
documents. The CLI in this repo talks to the Worker strictly over HTTPS —
no source-level coupling.

## Conventional commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation only
- `chore:` — tooling, dependencies, config
- `refactor:` — code reorganization without behavior change
- `test:` — tests only
- `ci:` — CI workflow changes
- `build:` — build system changes
- `perf:` — performance improvement

## Pre-commit checklist

Before every commit, verify that ALL relevant documentation is in sync:

1. **README.md** reflects new features, commands, architecture changes
2. **CHANGELOG.md** has an `[Unreleased]` entry for the change
3. **Changeset** (`pnpm changeset`) added for any user-facing change — this drives
   the version bump. **Never** bump `packages/core/package.json` by hand; Changesets'
   "Version Packages" PR does it (pre-release `alpha` mode). See [CONTRIBUTING.md](./CONTRIBUTING.md#releasing-changesets).
4. **CLAUDE.md** updated if architecture, tools, or patterns changed
5. **Rule docs** (`docs/rules/*.md`) updated if a rule changed

## Branching

- `main` is the only long-lived branch.
- Feature branches: `feat/<topic>`, `fix/<topic>`, `docs/<topic>`, `chore/<topic>`.

## PR descriptions

Keep PR descriptions short and scannable. The template has 3 sections:
**What** (1-2 sentences), **Why** (link the issue or 1 sentence), **Test
plan** (bullet checklist, not prose).

- Don't paste reproducer code, stack traces, or design notes into the PR
  body — they belong in the issue, in the commit message, or in a comment.
- Don't write a "How" section that just restates the code. The diff is the
  How.
- Don't add multi-paragraph rationale. If the *why* needs more than one
  sentence, write a doc / ADR and link it.

A reviewer should see the PR header and immediately know (a) what
changed, (b) why, and (c) how to verify. Anything beyond that earns
its place by being load-bearing for review.

## Merge rules (on `main`)

`main` is protected. Settings as of 2026-06-06:

- **Required checks:** `test`, `test-windows`, `perf`, `Check markdown links`,
  `bench-golden`, `generalization`. The last two are the only checks that run
  Lyse against real third-party design systems — promoted 2026-08-02; before
  that, no required check ran Lyse on a real repository at all. `test-windows`
  was promoted the same day: it hard-fails but was not required, so a Windows
  break merged in silence (it did, on #263).
- **Linear history** required — rebase against `main` before merge if behind
- **No merge commits** — use `gh pr merge --squash` or `gh pr merge --rebase`
- **Conversation resolution** required — all review threads must be
  marked "resolved" before merge

Admins (`thomaseyaa`, `noemuch`) can bypass protection in emergencies but
should not as a routine.

## Code style

- Strict TypeScript: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`.
- **No comments** unless WHY is non-obvious.
- Deterministic outputs (JSON keys sorted alphabetically).
- All artifacts (specs, rule docs, READMEs) in **English** — this repo's language policy.

## Testing

- `pnpm test` runs vitest with `passWithNoTests: true` in each workspace.
- Smoke test: `npx @lyse-labs/lyse audit packages/core/fixtures/full-ds/` must produce a stable, known Health Score.
- Dogfood: `npx @lyse-labs/lyse audit packages/core/` should also run cleanly.

## Privacy and security

- Anonymous `repo_bucket` fingerprint for telemetry (CJEU Breyer-clean).
- Telemetry opt-in only — first-run interactive consent prompt (max 2 attempts) or `LYSE_TELEMETRY=1` env override; persisted to `~/.lyse/consent.json`.
- Source code never leaves the user's machine via `lyse audit`.
- See [`PRIVACY.md`](./PRIVACY.md) for the full privacy posture.

## Development workflow (superpowers)

The [superpowers](https://github.com/obra/superpowers) skills (MIT) are vendored
under `.claude/skills/`. Follow that workflow for any non-trivial change:
**brainstorming** (design + user approval) → spec in `.superpowers/specs/` →
**writing-plans** (plan in `.superpowers/plans/`) →
**subagent-driven-development** (fresh subagent per task + per-task review) →
**requesting-code-review** before merge. TDD throughout; verification before
any completion claim.

`.superpowers/` is gitignored — specs, plans, and measurement reports are
internal working documents. Never commit them to this public repo; archive
anything worth keeping to `lyse-labs/lyse-internal`
(`internal/superpowers-archive/`).

## The night investigator

`.claude/agents/lyse-investigator.md` is a **read-only** agent for unattended
runs. It hunts one class of defect — a claim Lyse cannot back up — and reports
each with a command that reproduces it in thirty seconds. It has no write
access, opens nothing public, and discards its own hypotheses when it cannot
name a check that would have falsified them.

Read-only on purpose, and the reason is measured rather than cautious: the
ecosystem diff sees behaviour *changes*, never whether a change was *right*.
Three defects in one day's own PRs were caught by re-reading after CI was green
— `lyse handoff` exiting 0 on timeout, an extractor named on axes it had not
blocked, and the ecosystem diff's own blind spot. An agent has no fresh eyes on
its own work, and an issue costs thirty seconds to verify where a diff costs
twenty minutes.

**Graduation criterion, fixed in advance:** after 5 nights, if ≥70% of its
findings reproduce and are judged real, it earns write access on a narrow class
— one fix per PR, measured on both corpora, never auto-merged. Below that, the
harness is what needs work, not the permissions.

## Operating principles

- **Local-first by default.** New features should run on the user's machine unless they fundamentally cannot.
- **Thin SaaS.** The Worker handles identity, billing, aggregation. Compute stays in the CLI.
- **Open core.** AGPLv3 + Commercial dual license — see [`LICENSE`](./LICENSE) and [`COMMERCIAL.md`](./COMMERCIAL.md).
- **Determinism.** Same input → same output. No telemetry-by-default. No surprise network calls.

## Key modules

- **`packages/core/src/rules/registry.ts`** — exports `ruleObjects` (all 66 rule instances) and `ruleMap` (O(1) lookup). Import from here in `share.ts`, `audit-pipeline.ts`, `codemods/safety.ts`. Do NOT build local rule arrays.
- **`packages/core/src/rules/_rule-module.ts`** — `createLyseRule({ meta, ... })` is the single source of truth for rule metadata. The full `meta` shape (axis, lyseRuleId, defaultSeverity, shortDescription, fullDescription, helpUri, rationale, examples, allowlist) is passed inline in each rule file and registered into a module-level `META_REGISTRY`. `manifest.ts` derives `RULE_METADATA` from this registry — never edit `manifest.ts` to add a rule's metadata, edit the rule file.
- **`packages/core/src/config/schema.ts`** — exports `loadConfig(repoRoot, opts?: { onError: "throw" | "degrade" })`. Use `onError: "degrade"` in MCP paths; default (throw) in CLI audit paths.
- **`packages/core/src/detection/ds-packages.ts`** — evidence-based design-system identification. A repo's design system is a **family** of workspace packages, not one package: on radix, corvu and Twilio Paste no single package is "the" DS. `identifyDsFamily(packages, counts)` is pure and order-independent; membership requires component-shaped file evidence (`MIN_COMPONENT_FILES`, pinned at 1 by radix, whose typical primitive package holds exactly one `.tsx`), after shape-based disqualifiers rule out workspace roots, app/docs/site/playground directories and test/tooling packages. **Never add a rule that matches on what a package is called** — that regex (`DS_EXPORT_RE`) is what this module replaced. `family.primary` is a stable *label* used as a fallback module string; the family itself is what `graph/builder.ts#computeUsage` and `detection/components-resolution.ts#resolveComponentSources` consume.
- **`lyse handoff` — the single fix path** (`commands/handoff.ts` + `agent/*`): Lyse never edits code itself. `handoff` audits, writes the drift-class payload (`.lyse/handoff/findings.json` + `tokens.json`), installs the Lyse skill into the detected agent, and spawns it (Claude Code / Cursor / Codex) to edit the working tree (no commit, no PR). The spawned agent's stdout and stderr are teed to `.lyse/handoff/agent-transcript.log` (`agent/transcript.ts`) so an unattended run leaves a reviewable record; stdin stays inherited so `--review` can still prompt, and recording is best-effort — an unwritable log never fails the handoff. The spawn is bounded by `agent/spawn-guarded.ts#spawnGuarded`: 30 minutes by default (`LYSE_HANDOFF_TIMEOUT_MS`, `0` opts out), SIGTERM then SIGKILL after a grace period, exit `124`. Working-tree edits are NOT rolled back on timeout — unless `--isolate` (`agent/isolate.ts`, also `LYSE_HANDOFF_ISOLATE=1` / `.lyse.yaml` `handoff.isolate`), which runs the agent in a throwaway `git worktree` at HEAD and removes it on timeout. Isolation is refused on a dirty tree (the tree state is read BEFORE `writeArtifacts`, which would otherwise dirty it itself) and the transcript stays in the real repo. By default it spawns with the agent's permission prompts bypassed and asks a `Continue? [y/N]` safety confirmation first (skipped under `--yes` or non-interactively — see `menu/prompts.ts#confirmBypass`); `--review` (also `LYSE_HANDOFF_REVIEW=1` / `.lyse.yaml` `handoff.review`) launches under the agent's own default permissions instead and skips that confirmation. `lyse fix` is a deprecated alias that redirects to `handoff`; its former `--scaffold` / `--migrate-tokens` extras moved to `lyse init`. The deterministic codemods (`rule.applyCodemod` + `codemods/*`) remain — consumed by MCP `suggest_fix` and surfaced in the handoff payload.
- **`packages/core/src/diff/`** — the diff-first engine (P4): `anchor.ts` (stable per-finding identity — file + rule + normalized drifted literal, not line/message, so it survives reformatting), `graph-hash.ts` (deterministic hash of the Design System Graph for baseline-staleness detection), `baseline.ts` (build/serialize/read/write `.lyse/baseline.json`), `delta.ts` (`selectNew` — content-anchored findings report only the surplus over the baselined count; occurrence-only findings report all when the count increased), `gate.ts` (`evaluateGate` — fails on any new score-contributing finding or an axis-score regression vs the baseline). `lyse audit --scope new` is the diff-first path: it is CLI-only (does not enter the pipeline's `AuditFlags.scope` union) and is what `lyse add ci-gate`'s generated workflow runs. `.lyse/baseline.json` is committed — `.lyse/*` is gitignored with a `!.lyse/baseline.json` negation (`util/lyse-gitignore.ts`, since Git cannot re-include a file under an excluded directory).
