# Privacy Notice — Lyse

**Controller:** Lyse Labs
**Contact:** contact@getlyse.com

This document fulfils the transparency obligations of **GDPR Articles 13–14** and the related French CNIL guidance. It describes what Lyse collects, when, why, and what your rights are.

---

## 1. Default audit: static-only, fully local

`lyse audit` is **static-only by default**: it parses your code on your machine, computes the Health Score, and returns. No network calls. Nothing leaves the runner.

### Optional LLM-assisted flows (BYOK)

A few entry points may call out to an LLM provider you configure (Anthropic, OpenAI, OpenRouter, your local Ollama, or your IDE's LLM via MCP). They are **off by default** and you choose the provider:

- `lyse audit`'s LLM precision filter (drops false positives on hardcoded color/spacing). It is **off until you opt in** via one of:
  - `lyse audit --llm` (single run), or
  - `LYSE_LLM=1` (or accepting the one-time interactive prompt, persisted to `~/.lyse/llm-consent.json`), or
  - an explicit `llm.provider` / `llm.connector` in `.lyse.yaml`.

  Having the `claude` CLI installed no longer silently enables it. `lyse audit --no-llm` and `LYSE_LLM=0` force it off, and in non-interactive contexts (CI, pipes) it stays off.
- `lyse init` (only if an LLM credential is detected or you explicitly opt in) — generates a tailored rule pack.
- MCP host LLMs (Cursor / Claude Code / Codex) when your agent calls Lyse's MCP tools — that traffic goes through the IDE's own provider, not through Lyse.

When an LLM-assisted flow does run, what Lyse sends:

- The static findings from the current audit (~5–15 KB).
- 8–15 representative source files, capped at 200 KB total, selected to cover the DS dimensions being analyzed.
- Your `package.json` (dependencies only — `scripts` and other fields are stripped).

What Lyse never sends:

- `.env*`, `*.pem`, `*.key`, `*.p12`, `id_rsa*` (filename-based exclusion), or any file whose **content** matches a high-confidence secret-content scan (PEM private-key blocks; AWS `AKIA…`, OpenAI `sk-…`, GitHub `ghp_…`, Slack `xox…` token shapes; quoted long `api_key`/`secret`/`token`/`password` assignments) — such a file is dropped from the payload before it is sent.
- Anything matched by your `.gitignore`.
- The full source tree at any time.

Every LLM call is logged at `.lyse/llm-calls.jsonl` (git-ignored). You can audit them after each run.

`lyse audit --static-only`, `lyse audit --no-llm`, `LYSE_LLM=0`, and `llm: { provider: 'none' }` in `.lyse.yaml` are explicit escape hatches that turn every LLM path off.

**Lyse Labs never sees your code, your findings, your scores, or your API keys.** We do not run a proxy, do not host any LLM endpoint, and do not receive telemetry from your audits (telemetry remains opt-in only — see [Telemetry](#telemetry) below).

---

## 1a. Telemetry (opt-in only)

We collect data **only** when you explicitly opt in via the first-run consent prompt shown on your first `lyse audit`.

**Telemetry defaults to OFF.** It requires an explicit affirmative action — pressing `y` at the prompt.

### First-run consent prompt

On your first `lyse audit`, Lyse displays a one-time prompt describing exactly what data would be sent. Pressing `y` enables anonymous telemetry; pressing Enter, `n`, or interrupting the prompt declines. **The audit runs to completion in both cases — there is no functional difference between accepting and declining.** Your answer is saved to `~/.lyse/consent.json` and Lyse never prompts you again, except: if you decline on the first prompt, Lyse will ask one more time on your next audit (max two prompts in your lifetime). You can change your answer at any time (see §7).

In non-interactive environments (CI, scripts, piped output), no prompt is shown and telemetry remains OFF unless explicitly enabled.

---

## 2. What data we receive when telemetry is enabled

If — and only if — you opt in (by answering `y` at the first-run prompt, or by running `lyse telemetry on`): events are written to `.lyse/events.ndjson` in your repo.

The full event schema is published at [`schemas/v1/lyse-event.json`](./packages/core/schemas/v1/lyse-event.json) and contains:

| Field | Type | Example |
|---|---|---|
| `schema_version` | int | `1` |
| `event_id` | string (hex) | `"01HXYZ0123456789ABCDEFGHIJ"` |
| `event_type` | enum | `"audit.completed"` |
| `ts` | ISO date | `"<iso-timestamp>"` |
| `session_id` | string (hex) | `"01HXYZ0123456789ABCDEFGHIJ"` |
| `repo_bucket` | string (hex, 16 char) | hash of the repo identifier, computed locally by the CLI with an embedded salt (`BUCKET_SALT`, rotated per minor release) |
| `sdk_version` | string | `"0.2.0-alpha.4"` |
| `audit.score` | int 0-100 or `null` | `43` |
| `audit.axes` | object | `{ tokens: 30, a11y: 60, components: 38, stories: 47 }` |
| `audit.violations` | object | `{ error: 0, warning: 433, info: 0 }` |
| `audit.duration_ms` | int | `8341` |
| `stack` | object | `{ framework: "react", ds_detected: "tailwind-v4" }` |
| `finding.file_hash` | hex(8) | `"abcd1234"` — `SHA-256(filepath + salt)` truncated; **not reversible** |

---

## 3. What we explicitly DO NOT collect

- **No source code, file paths, or file content.** The `file_hash` field is an 8-character SHA-256 prefix of the file path with an embedded client-side salt (`BUCKET_SALT`) — the original path cannot be recovered.
- **No IP address.** The Cloudflare Worker handling `/v1/events` drops the `CF-Connecting-IP` header before any storage operation.
- **No User-Agent.** Same — dropped at the edge.
- **No GitHub username or actor identifier in stored data.** The OIDC `repository_id` is used transiently for rate-limiting and then discarded; only the salted hash is retained.
- **No personal data of any kind** (email, name, organisation name in cleartext).

---

## 4. Legal basis

**Article 6(1)(a) — explicit consent.** Consent is given by pressing `y` at the first-run prompt. Telemetry defaults to OFF and requires an affirmative action — pressing Enter or declining at the prompt leaves telemetry OFF, and the audit runs identically in both cases (no service is conditioned on consent, per Art. 7(4)).

We do not rely on legitimate interest (Art. 6(1)(f)) because the explicit-consent path is clean, machine-checkable, and survives a CNIL audit without an LIA balancing test.

---

## 5. Retention

- **Events (local):** written to `.lyse/events.ndjson` in your own repo. Retention is at your discretion as the data controller.
- **Aggregated counts** (used for the public `/v1/bench/summary` endpoint): retained indefinitely as pure statistical aggregates — no individual event is recoverable.

---

## LLM provider data flow (when you opt in)

If you enable an LLM-assisted flow (see §1), the provider you configure receives only the payload described in §1. You control the provider entirely:

| Provider mode | Where data goes | Cost to user |
|---|---|---|
| Anthropic (`ANTHROPIC_API_KEY`) | `api.anthropic.com` | per token, your bill |
| OpenAI (`OPENAI_API_KEY`) | `api.openai.com` | per token, your bill |
| OpenAI-compatible (`LYSE_LLM_ENDPOINT`) | user-configured endpoint (Ollama local, Together, Groq, etc.) | depends |
| OpenRouter (OAuth) | `openrouter.ai` → underlying provider | ~10% mark-up, your bill |
| MCP host (Cursor, Claude Code) | the IDE's LLM provider | covered by IDE subscription |
| `none` / `--static-only` | nowhere | n/a |

Files excluded from the data flow:

- `node_modules`, `dist`, `build`, `.git`, `.next`, `coverage`, `.lyse`
- Everything in `.gitignore`
- Files excluded by filename (`.env*`, `*.pem`, `*.key`, `*.p12`, `id_rsa*`)
- Files whose content matches the high-confidence secret-content scan (PEM
  private-key blocks, AWS/OpenAI/GitHub/Slack token shapes, quoted long
  `api_key`/`secret`/`token`/`password` assignments) — dropped before sending

Audit trail: every LLM call is appended to `.lyse/llm-calls.jsonl` (per-repo, git-ignored). Inspect via `cat .lyse/llm-calls.jsonl | jq`.

Permanent opt-out: set `llm: { provider: 'none' }` in `.lyse.yaml`.

---

## 5b. Optional email capture (`lyse init`)

Email is captured **only** during the `lyse init` wizard. `lyse audit` never
prompts for an email. The init prompt is:

- Strictly opt-in. Pressing Enter (no input) skips it and stores nothing.
- Suppressed entirely in CI, non-TTY contexts, `--yes` mode, or when
  `LYSE_NO_EMAIL_PROMPT=1` is set.
- If you type an address, it is validated against an RFC-5322-lite regex,
  then stored locally in `~/.lyse/profile.json` as
  `{ email, createdAt, lyseVersion }`.

When you opt in, Lyse POSTs the address to `/v1/profile/email`. That request
carries **only** `{ email, lyseVersion, capturedAt }` — never your source
code, findings, scores, or audit results.

If that send fails (e.g. you were offline), the email stays in
`~/.lyse/profile.json` and a later `lyse audit` will **read the file solely to
retry delivery** — a standalone POST to `/v1/profile/email` with that same
`{ email, lyseVersion, capturedAt }` payload. The retry is never bundled with
audit results and never includes source code or findings. Once delivery
succeeds the email is dropped locally (only a `sentAt` marker survives).

Delete `~/.lyse/profile.json` to revoke. We will honor a deletion request
emailed to contact@getlyse.com within 30 days of receipt.

---

## 6. Sub-processors

The telemetry pipeline relies on:

| Sub-processor | Role | Legal mechanism |
|---|---|---|
| Cloudflare (Workers + KV + DNS) | Receives `/v1/events` POSTs, stores aggregates, serves `/v1/bench/summary` | EU SCCs in place; EU data residency configured |

The Lyse site (`getlyse.com`) is **a redirect to the GitHub repo** — no analytics, no cookies, no tracking pixels.

---

## 7. Your rights (GDPR Arts. 15-22)

You may, at any time:

- **Access (Art. 15)** — request a copy of any data we hold tied to your `repo_bucket`. Email contact@getlyse.com with the bucket (visible in `.lyse/events.ndjson` after a local audit).
- **Rectification (Art. 16)** — correct inaccurate data (unlikely to apply given the data we hold).
- **Erasure (Art. 17)** — request deletion. Will be completed within 30 days.
- **Restriction (Art. 18)** — pause processing while disputes are resolved.
- **Data portability (Art. 20)** — receive your data in machine-readable JSON.
- **Object (Art. 21)** — withdraw consent. Run `lyse telemetry off`. Withdrawal is effective immediately and takes the same single action as giving consent (one keystroke at the prompt, or one command).

You also have the right to lodge a complaint with the **CNIL** (https://www.cnil.fr/) or your national data-protection authority.

---

## 8. Changes to this notice

We post a notice in the [GitHub releases](https://github.com/lyse-labs/lyse/releases) when this notice changes materially. Continued use after a material change constitutes acceptance.

---

*Hosted at `github.com/lyse-labs/lyse/blob/main/PRIVACY.md` and bundled in every npm release of `lyse`.*
