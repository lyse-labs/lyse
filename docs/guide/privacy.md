# Privacy — Lyse telemetry

**Contact:** contact@getlyse.com

This page covers the **opt-in telemetry** that powers the per-rule precision
calibration. For the broader privacy disclosure (BYOK LLM model, file sampling,
audit-time data flow), see [PRIVACY.md](../../PRIVACY.md) at the repository root.

> **TL;DR.** Telemetry is **off by default**. To enable it you must answer "y"
> to the first-run consent prompt shown by `lyse audit` *or* run
> `lyse telemetry on`. Your decision is persisted to `~/.lyse/consent.json`
> and you can change your mind at any time with `lyse telemetry off`. When
> telemetry is on, Lyse sends five fields: `ruleId`, `subAxisId`, `verdict`,
> `signed` (`/v1/feedback`) or `file`, `line`, `snippet`, `subAxisId`,
> `repoBucket`, `ts` (`/v1/missed-finding` — opt-in, with explicit per-call
> y/n confirmation), an HMAC-hashed repo bucket, and the SDK version.
> **No code, no file path, no URL, no IP.**

---

## What we collect

When `~/.lyse/consent.json` records `accepted: true` (set by the first-run
prompt or `lyse telemetry on`) and you run `lyse audit --interactive` (or
`lyse feedback --missed`), each event the CLI sends contains **exactly these
five fields**:

| Field | Example | Notes |
|---|---|---|
| `ruleId` | `tokens/no-hardcoded-color` | The id of the rule that fired, from the public manifest. |
| `subAxisId` | `tokens.color` (or `unmapped`) | The sub-axis the rule maps to in the [sub-axes catalogue](../architecture/sub-axes.md). |
| `verdict` | `valid` / `invalid` / `skipped` | Your verdict in the interactive review. (`/v1/missed-finding` carries `missed` instead.) |
| `repoBucket` | `abcd1234deadbeef` | A 16-char HMAC-SHA256 of `(remote_origin_url, rotating_salt)`. CJEU Breyer-clean. |
| `signed` | `false` | Whether the event was signed by an ed25519 license key. Signed events carry a higher manifest weight (×1.0 vs ×0.1 anti-spam). |

The `/v1/missed-finding` endpoint additionally carries **one line of source
code** that you explicitly nominated by running
`lyse feedback --missed <file>:<line>`. The CLI prints a confirmation banner
naming the bytes being uploaded and requires a `y/n` answer before the
request is dispatched. There is no other channel through which Lyse uploads
source code via telemetry.

We never collect:

- File paths, line numbers, or code (except the one user-selected line above).
- The raw remote URL of your repository.
- Your IP address — the Worker strips `CF-Connecting-IP`, `X-Forwarded-For`,
  and `X-Real-IP` at the edge before any handler logic runs.
- Your User-Agent.
- Your API keys, tokens, or any other credentials. (Lyse stores credentials
  in your OS keychain or `~/.lyse/credentials`. They never leave the
  machine.)
- Any environment variables.

---

## Why we collect it

Each `verdict` event nudges the per-sub-axis confidence weight in the public
confidence manifest. When the
Wilson lower bound on a sub-axis's precision crosses 0.90, the sub-axis is
promoted from `experimental` to `stable` and its findings start contributing
to the Health Score. Telemetry is **the** signal that makes that promotion
possible. Without it, every sub-axis would have to be hand-labelled, and
the manifest would never catch up with new rules.

Missed-finding reports seed the gold-label queue — concrete examples of
findings the auditor should have caught. They feed the recall side of the
calibration, not precision.

---

## How long we keep it

- Raw events stay in R2 for **30 days**, then are deleted.
- Per-month aggregates (per-sub-axis tallies of `valid` / `invalid` /
  `skipped` counts) live in R2 indefinitely. These aggregates carry no
  identifier at all — no `repo_bucket`, no event id.

---

## How to opt out

Telemetry is **off by default** — a fresh install never sends anything until
you explicitly opt in. To stay off, you do not have to do anything.

If you already opted in and want to revoke (GDPR Art. 7(3) — withdrawal must
be as easy as granting):

1. **Persistent revoke.** `lyse telemetry off` rewrites
   `~/.lyse/consent.json` with `accepted: false`. All subsequent audits run
   fully local.
2. **Per-run override.** `lyse audit --no-telemetry` suppresses telemetry
   for that single invocation **without** touching `~/.lyse/consent.json`.
   Use it for a one-off audit you do not want recorded.
3. **Nuke the record.** Delete `~/.lyse/consent.json`. The next `lyse audit`
   will start the consent flow from scratch (one prompt, then a final
   re-prompt only if you answered "n" the first time — see the consent prompt
   section below).

`lyse telemetry status` prints the current persisted state at any time.

---

## What you can request

Because the only identifier we receive is `repo_bucket` — a one-way HMAC
of `(remote_origin_url, salt)` rotated daily — there is no key on the
server side that points back to a person, repository, or IP. We have no
ability to enumerate your events or delete them on request, because we
have no way to know which events are "yours".

If you are uncomfortable with that asymmetry, do not opt in. Lyse Labs
cannot revoke records it cannot identify, by design.

---

## First-run consent prompt

When you run `lyse audit` for the first time on a machine (no
`~/.lyse/consent.json` yet) **and** stdout is a TTY, the CLI prints:

```
Lyse can send anonymous benchmark data to help improve the tool and
power the public Health Score bench. Data sent (only on audit completion):
  - Your Health Score (0-100)
  - Per-axis scores
  - Audit duration
  - Hashed repo identifier (irreversible)
What is never sent: source code, file paths, file content, IP, User-Agent.
Full notice: https://github.com/lyse-labs/lyse/blob/main/PRIVACY.md
Enable anonymous bench? [y/N]:
```

- **The default is "N".** Pressing Enter alone declines.
- **The audit runs to completion either way.** Same files, same rules, same
  Health Score, same exit code. Your answer affects only whether the
  resulting score is sent to the public bench.
- Your answer is persisted to `~/.lyse/consent.json` so the prompt is not
  repeated.

**Lifetime cap of 2 prompts.** If you answer "y", you are never prompted
again. If you answer "n" (or skip via Ctrl+C / EOF), the next `lyse audit`
will ask **one more time** with identical wording; whatever you answer the
second time is final. After two declines the consent file is permanent and
you can only re-enable via `lyse telemetry on`.

**Non-TTY environments** (CI, pipes, redirected stdout) skip the prompt
entirely and treat consent as absent — no events are sent.

---

## Legal basis

Lyse Labs is the data controller. The legal basis for processing is **Article
6(1)(a) GDPR — consent**, given explicitly by answering "y" to the first-run
prompt on `lyse audit` or by running `lyse telemetry on`. Withdrawal is one
command (`lyse telemetry off`), satisfying Article 7(3). The processing is
"minimum necessary" under Article 5(1)(c) — we only collect the five fields
named above, and one optional snippet under explicit per-event opt-in.

---

## FAQ

### 1. Can you de-anonymize me from `repoBucket`?

`repoBucket` is a 16-character HMAC-SHA256 of `(remote_origin_url, daily_salt)`. Daily rotation breaks cross-day correlation. Reversing a bucket back to a URL requires three inputs: the day's salt (public), the bucket (in our store), and a candidate URL list to enumerate — the universe of plausible git remotes is unbounded, so no practical reverse mapping exists at this scale.

This passes the **CJEU *Breyer*** test for "personal data": an identifier is personal data only when the controller has reasonable means to combine it with auxiliary data to identify a person. Without the candidate URL list, the bucket fails that test by construction.

### 2. What happens if I run `lyse audit` and never opt in?

Zero network calls related to telemetry. `~/.lyse/consent.json` defaults
to absent (which the CLI treats as opted-out), and Lyse never makes a
"phone home" call to check for updates, license status, or anything else
from `api.getlyse.com`.

`lyse audit` still talks to **your** LLM provider if you have one
configured — that flow is BYOK and documented in
[`PRIVACY.md`](../../PRIVACY.md) at the repository root. Lyse Labs never
sees that traffic; it goes from your machine directly to the provider
endpoint you set in `.lyse.yaml`. If you want zero outbound
audit traffic at all, run `lyse audit --static-only` (forces every LLM
path off, including any opt-in BYOK flow).

### 3. What if I'm GDPR-subject and want my data deleted?

Per Article 17 you may email `contact@getlyse.com` to request erasure.
**But** because we store no personal data — no IP, no email, no
GitHub identifier, only an anonymous `repoBucket` and a verdict — there
is no row that points back to you that we could delete. This is the
GDPR Article 11 §2 case: the controller cannot identify the data
subject, and therefore Articles 15–22 do not impose an obligation to
maintain identifiability solely to satisfy a request.

The aggregate confidence manifest is also out of reach: once your
verdicts are folded into the monthly per-sub-axis tally, they are
irreversibly aggregated and cannot be subtracted. If this matters,
decline the first-run prompt (or run `lyse telemetry off` if you have
already opted in).

### 4. What does the LLM see during a `lyse audit`?

This is a separate flow from telemetry — see
[`PRIVACY.md`](../../PRIVACY.md) at the repository root for the full
breakdown. In short: your LLM provider (BYOK — Anthropic, OpenAI,
OpenRouter, Ollama, or your IDE's host LLM) receives a
privacy-filtered sample of your codebase capped at 200 KB: 8–15
representative source files, your `package.json` (dependencies only),
and the static findings from the current audit.

Lyse Labs never sees any of this — there is no proxy, no Lyse-hosted
LLM endpoint, no mirror. Every LLM call is logged locally to
`.lyse/llm-calls.jsonl` (git-ignored) so you can audit the exact
bytes that left your machine. Run `lyse audit --static-only` to skip
the LLM step entirely.

### 5. What if I `lyse feedback --missed Card.tsx:42`?

That command is the only channel through which Lyse uploads source
code via telemetry, and it is gated on an explicit per-call y/n
confirmation. When you nominate a line, the CLI:

1. Extracts up to 200 characters around the cited line.
2. Runs the secret-content heuristic (regexes for API keys,
   `-----BEGIN PRIVATE KEY-----`, `.env`-style assignments, etc.) and
   aborts if it trips.
3. Prints the exact bytes that would be sent and waits for `y/n`.
4. On `y`, POSTs `{ ruleId, subAxisId, file, line, snippet,
   repoBucket, ts }` to `api.getlyse.com/v1/missed-finding`.

This endpoint is **distinct from** `/v1/feedback` (the verdict
stream). Missed-finding payloads land in the hand-label queue used to
grow the public gold-set; verdict events feed the confidence
manifest. Neither stream collects an IP, a User-Agent, or anything
beyond the fields named in this document.

### 6. Is the dataset public?

Yes. `github.com/lyse-labs/lyse-bench` (live, CC BY 4.0)
hosts the gold-set, the methodology, the pinned-corpus SHAs, and
the per-release Wilson 95 % LB tables. Every precision and recall
number Lyse publishes is reproducible from that repo plus the Lyse
source tree at the matching git tag. If a claim cannot be reproduced
that way, it is a bug — please file an issue against either repo.

The gold-set itself is MIT-licensed so competitors and academic
researchers can use it without restriction. We consider that a feature,
not a vulnerability: the whole category is better off if precision and
recall claims become independently verifiable.

---

## Changes to this policy

This file is checked into the public repository at
[`docs/guide/privacy.md`](https://github.com/lyse-labs/lyse/blob/main/docs/guide/privacy.md).
Every change is auditable from the git history. If we ever start collecting
a sixth field, this file (and the confidence manifest)
will be updated in the same commit.
