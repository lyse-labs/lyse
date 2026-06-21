# Health Score badge — design

**Status: APPROVED 2026-06-21 (Noé). Next: writing-plans → TDD.**
Flow: /using-superpowers. Adoption funnel gap #1 (highest impact/effort).

## Problem

A repo running Lyse has no way to display its Health Score. Every OSS design
system that adds a `![Lyse 78/100]` badge to its README becomes free,
compounding distribution (README viewers discover Lyse). The badge is the
single highest-leverage adoption lever and it doesn't exist.

## Decision (locked with Noé)

Add `lyse badge`. Emit a [shields.io](https://shields.io) badge from the local
audit score. Local-first: the score is computed on the user's machine and
embedded in a URL / JSON the **user** commits; shields.io is fetched by the
README viewer's browser (GitHub camo), never by Lyse. No hosting, no data
egress.

## Architecture

**Pure core — `packages/core/src/share/badge.ts`:**

```ts
export type BadgeGrade = "A" | "B" | "C" | "Fail" | "N/A";
export interface BadgeInput { score: number | "N/A"; grade: BadgeGrade; repoUrl: string | null; }
export interface BadgeOutput {
  endpointJson: { schemaVersion: 1; label: string; message: string; color: string };
  staticUrl: string;       // https://img.shields.io/badge/...
  staticMarkdown: string;  // [![Lyse](staticUrl)](repoUrl?)
  endpointMarkdown: (rawJsonUrl: string) => string;
}
export function buildBadge(input: BadgeInput): BadgeOutput;
```

- Color by grade: `A→brightgreen`, `B→green`, `C→yellow`, `Fail→red`, `N/A→lightgrey`
  (grade bands from `reliability/grade.ts`: A≥80, B≥60, C≥40, Fail<40).
- `message`: `"<score>/100 (<grade>)"`, or `"N/A"` when score is `"N/A"`.
- `label`: `"Lyse"`.
- `staticUrl`: `https://img.shields.io/badge/<label>-<message>-<color>` with
  shields path-encoding (` `→`_`, `_`→`__`, `-`→`--`, then `encodeURIComponent`;
  `/` becomes `%2F`). Deterministic, pure.
- `staticMarkdown`: `[![Lyse Health Score](<staticUrl>)](<repoUrl>)` — the link
  wrapper is dropped when `repoUrl` is null.
- `endpointMarkdown(rawUrl)`: `[![Lyse Health Score](https://img.shields.io/endpoint?url=<rawUrl>)](<repoUrl>)`.

**Orchestration — `packages/core/src/commands/badge.ts`** (mirror `commands/share.ts`):
- `runBadge(cwd, { write?: boolean; quiet?: boolean })`.
- `auditDirectory(cwd)` → `finalScore`, `grade.grade`; `detectFromGit(cwd)` → repo.
- Always print the **static** markdown (instant copy-paste) to stdout.
- With `--write`: write `.lyse/badge.json` (the `endpointJson`, pretty + sorted
  keys, deterministic) and ALSO print the **endpoint** markdown + a one-line note:
  "commit `.lyse/badge.json`; refresh it in CI with `lyse badge --write`". The
  raw URL is built from the detected repo + current branch:
  `https://raw.githubusercontent.com/<owner>/<repo>/<branch>/.lyse/badge.json`
  (branch from git; falls back to `main` if undetectable — documented).
- Spinner on stderr (like share); stdout carries only the pasteable output.

**CLI — `cli.ts`:** register `badge` subcommand with a `--write` boolean flag.

## Data flow

```
lyse badge            → audit → buildBadge → print static markdown
lyse badge --write    → audit → buildBadge → write .lyse/badge.json
                                            → print endpoint markdown + CI note
README (static)  → shields.io renders the frozen score (re-run to refresh)
README (endpoint)→ shields.io reads the committed JSON → CI refreshes it each run
```

## Error handling

- No git repo / no GitHub remote → `repoUrl` null: static markdown still works
  (no link wrapper); endpoint markdown prints with a `<owner>/<repo>` placeholder
  note telling the user to fill it (can't fabricate a raw URL without a remote).
- Audit failure → surfaces like `share` (spinner.fail + rethrow).
- `--write` to an unwritable `.lyse/` → error message, non-zero exit; never
  partial-writes (write temp + rename, like the consent module).
- Score `"N/A"` (no scorable axes) → badge says `N/A` / lightgrey (honest).

## Testing (TDD)

- **`buildBadge` (pure, the bulk):** A/B/C/Fail/N/A → correct color + message;
  shields path-encoding (`78/100 (B)` → `78%2F100_(B)` with `(`/`)` and space
  handled); `staticMarkdown` link wrapper present with repo / absent without;
  `endpointJson` shape (`schemaVersion:1`).
- **CLI smoke:** `lyse badge` on `fixtures/full-ds` prints a `https://img.shields.io/badge/` line; `--write` creates `.lyse/badge.json` with valid endpoint schema (then clean up the temp fixture write).
- Determinism: same audit → byte-identical badge output.

## Docs

- `docs/guide/cli-reference.md`: add `lyse badge` (+ `--write`).
- `docs/guide/getting-started.md`: a "Show your score" step.
- **README.md: dogfood** — add Lyse's own badge to the top (using the endpoint
  JSON committed at `.lyse/badge.json`, refreshed by Lyse's own CI later).
- CHANGELOG `[Unreleased]` → `### Added`.

## Scope / YAGNI

- No hosted badge endpoint (`health.getlyse.com`) — violates local-first; the
  endpoint-JSON-in-repo pattern gives auto-update without hosting.
- No SVG generation (shields.io renders it; hand-rolled SVG is needless code).
- No automatic CI wiring in this slice — the `--write` + note is enough;
  folding it into `lyse add ci-gate` is a follow-up.
- No HTML report (separate funnel gap, separate slice).

## Honest limits

- Static badge is frozen at generation (documented; `--write` endpoint path is
  the auto-updating answer).
- Endpoint raw URL assumes the JSON is committed on the resolved branch; if the
  user commits to a different branch, they edit the URL (noted in output).
- shields.io is a third-party render dependency (standard for badges); offline
  README viewers won't see it — acceptable and conventional.
