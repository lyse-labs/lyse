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
3. **Version files** (`package.json`) bumped if needed
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

- **Required checks:** `test`, `perf`, `Check markdown links`
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
- Smoke test: `npx @lyse-labs/lyse audit fixtures/full-ds/` must produce a stable, known Health Score.
- Dogfood: `npx @lyse-labs/lyse audit packages/core/` should also run cleanly.

## Privacy and security

- Anonymous `repo_bucket` fingerprint for telemetry (CJEU Breyer-clean).
- Telemetry opt-in only — first-run interactive consent prompt (max 2 attempts) or `LYSE_TELEMETRY=1` env override; persisted to `~/.lyse/consent.json`.
- Source code never leaves the user's machine via `lyse audit`.
- See [`PRIVACY.md`](./PRIVACY.md) for the full privacy posture.

## Operating principles

- **Local-first by default.** New features should run on the user's machine unless they fundamentally cannot.
- **Thin SaaS.** The Worker handles identity, billing, aggregation. Compute stays in the CLI.
- **Open core.** AGPLv3 + Commercial dual license — see [`LICENSE`](./LICENSE) and [`COMMERCIAL.md`](./COMMERCIAL.md).
- **Determinism.** Same input → same output. No telemetry-by-default. No surprise network calls.

## Key modules

- **`packages/core/src/rules/registry.ts`** — exports `ruleObjects` (all 51 rule instances) and `ruleMap` (O(1) lookup). Import from here in `fix.ts`, `share.ts`, `audit-pipeline.ts`, `codemods/safety.ts`. Do NOT build local rule arrays.
- **`packages/core/src/rules/_rule-module.ts`** — `createLyseRule({ meta, ... })` is the single source of truth for rule metadata. The full `meta` shape (axis, lyseRuleId, defaultSeverity, shortDescription, fullDescription, helpUri, rationale, examples, allowlist) is passed inline in each rule file and registered into a module-level `META_REGISTRY`. `manifest.ts` derives `RULE_METADATA` from this registry — never edit `manifest.ts` to add a rule's metadata, edit the rule file.
- **`packages/core/src/config/schema.ts`** — exports `loadConfig(repoRoot, opts?: { onError: "throw" | "degrade" })`. Use `onError: "degrade"` in MCP paths; default (throw) in CLI audit paths.
- **`lyse fix` 6 safety guards** (`commands/fix.ts` + `codemods/safety.ts`): (1) clean git working tree, (2) git repo required, (3) token map discoverable, (4) high-confidence codemods only by default, (5) per-run file count cap (default 200), (6) non-TTY contexts default to `--dry-run`.
