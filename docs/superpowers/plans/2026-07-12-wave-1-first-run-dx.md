# Wave 1 — First-run DX & display honesty — Implementation Plan

> **For agentic workers:** execute task-by-task; each task lands as its own
> conventional commit with tests, a changeset (when user-facing), and a
> CHANGELOG entry. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the first `lyse audit` run friction-free and honest — no
prompt before the first score, a terminal view that shows every scored axis,
and a robust `@lyse-overrides` parser (#226) — WITHOUT changing the Health
Score of any repo (determinism contract: same input → same score).

**Context:** Expert-panel review (2026-07-12) against the react-doctor
playbook: Lyse's engine is strong, but (a) two consent prompts fire before
the first score on a TTY, (b) the default view shows 4 of the 6 scored axes,
(c) a user-reported bug (#226) makes per-file overrides silently inert in
common real-world file shapes. All three erode trust exactly where a
first-time user forms their opinion.

## Global Constraints

- **No score change.** Nothing in this wave may alter `scoreFromFindings`
  inputs or outputs for any repo. Suppression fixes (#226) change what a
  *user who wrote an override block* scores — that is the documented,
  intended behavior of the existing feature, not a scoring-contract change.
- Strict TS (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`,
  `verbatimModuleSyntax`); ESM `.js` specifiers; no comments unless WHY.
- CI/non-TTY behavior stays byte-identical (prompts already bypassed there).
- Conventional Commits; changeset per user-facing change; CHANGELOG
  `[Unreleased]` entries; rule docs untouched (no rule behavior changes).

## Task 1: #226 — robust `@lyse-overrides` parsing

`parseFileOverrides` (`src/suppression/frontmatter.ts`) is all-or-nothing
brittle. Proven silent-failure shapes (all parse to ZERO entries today):

1. CRLF line endings (`$` anchor never matches a line with trailing `\r`).
2. A blank comment continuation line (` *`) between the tag and the entries
   (scan hard-stops at the first non-entry line).
3. An entry on the same line as the tag (`* @lyse-overrides tokens/x: off`).
4. Multiple `@lyse-overrides` blocks in one file (only the first tag line is
   located; a second block's entries are never read).

Because `tokens/no-hardcoded-color` skips custom-property token definitions
by design, a broken block in a `tokens.css` looks like "only the color
override worked" — the exact misread in #226.

- [ ] Failing tests in `tests/suppression/frontmatter.test.ts` for all four
      shapes + the exact issue-226 CSS block + "stops at `*/`" guard.
- [ ] Rewrite the scan: split on `/\r?\n/`; visit EVERY tag line; read an
      entry from the tag line's remainder; skip blank comment continuation
      lines; stop a block at `*/`, at the next tag line, or at prose.
- [ ] Keep precedence semantics: `off` union across blocks; severity map
      last-write-wins; `off` beats severity at the pipeline (unchanged).
- [ ] Changeset (patch) + CHANGELOG Fixed entry referencing #226.

## Task 2: no prompt before the first score

`runAudit` currently calls `ensureConsentDecision()` (telemetry) and
`resolveLlmConsent(undefined)` (LLM) BEFORE the audit runs — on a first-run
TTY that is two yes/no privacy prompts before any value is shown.

- [ ] Move the telemetry consent prompt AFTER the report is rendered: run
      the audit with telemetry treated as undecided-off, render the score,
      THEN (interactive TTYs only, non-`--json` formats only) ask once.
      Env override `LYSE_TELEMETRY` and persisted decisions keep working;
      CI/non-TTY unchanged (silent decline, max-2-attempts policy kept).
- [ ] LLM consent: stop prompting on the default audit path. The Noop
      connector already guarantees offline behavior; prompt only when a
      feature explicitly needs a connector (`--llm`, handoff agent spawn).
- [ ] Preserve ADR 0012 (no `command_invoked` event on the run that first
      asks consent) — the event-suppression logic moves with the prompt.
- [ ] Tests: consent ordering (score renders before any prompt callback),
      non-TTY bypass, env override, ADR-0012 suppression.
- [ ] Changeset (minor: UX change) + CHANGELOG + PRIVACY.md wording check.

## Task 3: terminal view shows every scored axis

`reporters/terminal.ts` hardcodes `AXES_ORDER = [tokens, a11y, components,
stories]` while the score includes `ai-surface` and `ai-governance`. The
README sells 6 axes; the default view shows 4. Display-only fix:

- [ ] Extend the default axis rendering to all 6 scored axes (order:
      tokens, components, a11y, stories, ai-surface, ai-governance) —
      sourced from the scorer's axis list, not a second hand-kept array.
- [ ] N/A axes (no opportunities) keep rendering as today's muted state.
- [ ] Snapshot/unit tests updated; JSON/SARIF/HTML outputs untouched (they
      already carry all axes).
- [ ] Changeset (patch, display-only) + CHANGELOG.

## Task 4: positioning (BLOCKED on user)

Tagline candidates proposed to the maintainer; README edit deferred until
one is chosen. No code in this task.

## Explicitly OUT of this wave

- Retiring ai-surface/ai-governance from the score (would be a
  scoring-contract major; needs its own ADR + Phase B decision).
- Score-gauge redesign beyond axis parity (screenshot moment is Wave 2).
- Leaderboard / launch assets (Wave 2).

## Risks

- **npm registry is blocked in this remote session** — the full vitest
  suite cannot run here; unit-level verification is done by executing the
  real modules with the system TypeScript, and CI must gate the PR.
- Consent reordering touches a privacy-sensitive path: PRIVACY.md and ADR
  0012 semantics must be preserved and re-read before merge.
