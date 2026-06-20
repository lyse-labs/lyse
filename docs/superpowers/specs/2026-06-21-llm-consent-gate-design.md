# LLM opt-in consent gate — design

**Status: APPROVED 2026-06-21 (Noé). Next: writing-plans → TDD build.**
Flow: /using-superpowers — TDD, code-review, verification-before-completion.

## Problem

`lyse audit` promises (PRIVACY.md, CLAUDE.md) that the LLM layer is **off by
default** and source code never leaves the machine without opt-in. The code
violates this: `llm/connectors/resolver.ts:115-126` **auto-selects the
agent-cli connector whenever the `claude` CLI is on PATH**, with no provider
config and **no consent prompt**. A developer who has Claude Code installed
runs `lyse audit` and their source files are sent to an LLM silently. Only
`--static-only` or `LYSE_DISABLE_AGENT_AUTODETECT=1` stops it.

This is the gap to close: make the cloud LLM layer **explicit opt-in**, mirroring
the existing telemetry-consent pattern, and close the silent auto-on hole.

## Decisions (locked with Noé, 2026-06-21)

1. **Close the auto-on hole.** The `claude`-on-PATH auto-detect path returns a
   connector ONLY when consent is granted; otherwise `NoopAdapter` (static
   floor). Applies to cloud API providers too.
2. **Opt-in suffices; the LLM may refine the score.** Default (no consent) =
   deterministic static floor. After explicit opt-in, the existing behavior
   stands: the filter drops FPs and the score reflects the refined findings.
   "Advisory" here means **off-by-default / opt-in**, NOT score-decoupled. No
   ADR-0015 reversal. Non-determinism when ON is the user's deliberate choice.

## Architecture

**New module `packages/core/src/llm/consent.ts`** — structural mirror of
`telemetry/consent.ts` (same proven shape, separate state file):

- State file: `~/.lyse/llm-consent.json`,
  `{ accepted: boolean, attempt: 1|2, decided_at: string, version: "1.0.0" }`.
- `readLlmConsent(deps?)` / `writeLlmConsent(record, deps?)` — disk I/O, injectable deps for tests.
- `promptForLlmConsent(): Promise<"yes"|"no"|"skip">` — interactive `prompts`
  confirm (initial: false); non-TTY → `"skip"`. Message names what is sent and
  where (≈8–15 representative source files, ≤200 KB, secrets excluded; nothing
  goes to Lyse Labs; BYOK / local provider).
- `ensureLlmConsentDecision(deps?): Promise<{ accepted: boolean; justAsked: boolean }>`:
  - `LYSE_LLM=0` → hard opt-out, `{accepted:false}`, never prompt.
  - `LYSE_LLM=1` and no record → persist accepted, `{accepted:true}`.
  - existing record accepted OR `attempt===2` → return persisted, no prompt.
  - non-TTY → `{accepted:false}` (no surprise cloud calls in CI).
  - else prompt; persist with `attempt = existing ? 2 : 1`; return outcome.

**Consent resolution point.** Resolved once, async, at the `lyse audit` entry
(in `audit-pipeline.ts` or its CLI caller), exactly like telemetry consent —
NOT inside the sync `resolveConnector`.

**Single source of truth — `llmConsentGranted(...)`.** To avoid split-brain
logic, ONE pure helper computes the boolean (in `consent.ts`):

```
llmConsentGranted({ config, flags, decision, env }): boolean
```

Precedence (first match wins):
1. **Hard OFF** → `false`: `flags.llm === false` (`--no-llm`), `flags.staticOnly`,
   `config.llm.staticOnly`, `config.llm.provider === "none"`, or `env.LYSE_LLM === "0"`.
2. **ON** → `true`: `flags.llm === true` (`--llm`), `env.LYSE_LLM === "1"`,
   an explicit `config.llm.provider` (not `"auto"`/`"none"`) or `config.llm.connector`,
   or `decision.accepted === true` (persisted/prompt outcome from `ensureLlmConsentDecision`).
3. Otherwise → `false`.

`LYSE_LLM=0` is a **runtime** hard opt-out: it forces OFF for the run but does
NOT rewrite `~/.lyse/llm-consent.json` (mirrors how a runtime env override is
transient, not a persisted decision).

**`resolveConnector` gate (`resolver.ts`).** Add `opts.consented?: boolean`
(default `false` → safe for every caller incl. MCP). The resolver does NOT
re-derive consent from config — it simply returns `NoopAdapter` when
`opts.consented !== true`, and otherwise runs its existing provider/connector
resolution. The audit entry computes `consented = llmConsentGranted(...)` and
threads it in. This keeps consent logic in one place; the resolver keeps only
its existing hard short-circuits (`staticOnly`, `provider==="none"`) as
defense-in-depth.

The hole specifically: the `!provider && !connector` auto-detect branch
(lines 115-126) is reached only when `consented === true`; otherwise the
function returns `NoopAdapter` before that branch.

**CLI flags (`audit-flags.ts` + `cli.ts`).** Add `--llm` / `--no-llm`
(highest precedence, per-run): `--no-llm` forces static-only for the LLM stages;
`--llm` counts as consent for that run (no prompt). Maps to
`flags.llm?: boolean`.

## Data flow

```
lyse audit
  → decision = await ensureLlmConsentDecision()   [async, once; env/persisted/TTY-prompt]
  → consented = llmConsentGranted({ config, flags, decision, env })
  → runFilterStage / runLayer4Stage
       → resolveConnector(config, flags, { consented })
            consented ? real adapter : NoopAdapter
  → NoopAdapter ⇒ empty text ⇒ filter bails ⇒ static floor preserved byte-for-byte
```

Note: `ensureLlmConsentDecision` is only *called* (and may prompt) when the
auto-detect path is in play and no env/config opt-in already settles it — i.e.
don't prompt a user who already set `LYSE_LLM=1`, `--no-llm`, or explicit config.

## Error handling — all fail-safe to OFF

Non-TTY → off. Prompt cancelled/throws → off. `~/.lyse` unreadable/unwritable →
off (best-effort persist; a write failure does not enable the LLM).
`LYSE_LLM=0` beats everything. Any ambiguity defaults to NOT sending source.

## Testing (TDD)

Mirror `telemetry/consent` tests, adapted:
- `LYSE_LLM=1` (no record) → accepted, no prompt, persisted.
- `LYSE_LLM=0` → `llmConsentGranted` returns false even with a prior accepted
  record; never prompts; does NOT rewrite `~/.lyse/llm-consent.json`.
- non-TTY → off, no prompt.
- persisted accepted → returns accepted, no prompt.
- two declines → `attempt` caps at 2, never prompts a third time.
- write failure → returns the decision but stays off-safe.
- **resolver gate:** `resolveConnector` with `claude` "available" but
  `consented:false` → `NoopAdapter`; with `consented:true` → agent-cli adapter.
  Explicit `provider:"anthropic"` → adapter even without `consented` (deliberate
  config). `provider:"auto"` without consent → Noop.
- **determinism side-effect:** a non-TTY audit with `claude` available but no
  consent yields the static floor (no `--static-only` needed). Keep existing
  `--static-only` guards in place (minimize blast radius); add this as a new
  assertion.

## Docs

- **PRIVACY.md**: amend the "off by default" section to state the LLM layer is
  off until explicit opt-in (interactive prompt, `LYSE_LLM=1`, or explicit
  `llm.provider`/`llm.connector` config), and that `claude`-on-PATH no longer
  silently enables it. Document `~/.lyse/llm-consent.json` and `LYSE_LLM=0`.
- **CHANGELOG**: `Changed`/`Fixed` — LLM layer now requires explicit opt-in;
  closes the silent auto-on-when-`claude`-present hole.
- **README**: brief note on enabling the LLM layer (prompt/env/config/`--llm`).

## Scope / YAGNI

- No new provider, no score-decoupling, no consent-management subcommand
  (`--reset-llm-consent` is YAGNI; users can delete the JSON).
- `LYSE_DISABLE_AGENT_AUTODETECT` stays as a belt-and-suspenders kill switch.
- MCP/other callers of `resolveConnector` are safe-by-default (consented:false)
  — they opt in explicitly the same way.

## Honest limits

- Config-as-consent (`explicit llm.provider`) means a user who writes
  `llm.provider: anthropic` is treated as opted-in without a prompt. This is
  intentional (deliberate config = consent), documented in PRIVACY.md.
- A user who sets `LYSE_LLM=1` in a shared shell profile opts in globally — same
  posture as `LYSE_TELEMETRY=1` today.
