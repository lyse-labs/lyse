# HTML report (`lyse audit --format=html`) — design

**Status: APPROVED 2026-06-21 (Noé). Next: writing-plans → TDD.**
Flow: /using-superpowers. Adoption (#207) — the remaining clean shareable artifact.

## Problem

Lyse has `json`/`sarif`/`text` output but **no shareable visual report**. A team
can't screenshot a score for a meeting or attach a self-contained HTML to a PR/
email. Adoption funnel gap: no persistent, presentable artifact.

## Decision

Add `lyse audit --format=html` → a **self-contained** HTML file (inline CSS, no
external fonts/scripts/CDN) rendering the existing `AuditResult`. Pure render of
data already computed — no scoring change, no FP, deterministic.

## Architecture

**Pure reporter — `packages/core/src/reporters/html.ts`:**

```ts
export function renderHtml(result: AuditResult, opts?: { includeTimestamp?: boolean }): string;
```

- One `<!doctype html>` document with an inline `<style>` block. No external
  requests (self-contained = works offline, safe to email/commit).
- Sections:
  - **Header**: grade (A/B/C/Fail/N/A) + score, colored by band
    (A brightgreen … Fail red, N/A grey) — reuse the grade→color mapping logic
    (mirror `share/badge.ts` COLOR map so the two stay visually consistent).
  - **Axes**: a row per axis with a proportional bar + score (N/A rendered as "N/A").
  - **Findings**: a table — severity · ruleId · `file:line` · message. Sorted
    deterministically (reuse the json reporter's `sortFindings` order: severity,
    file, line, column, ruleId). Cap the rendered rows (e.g. 200) with a
    "+N more" note (the full set stays in `--format=json`).
  - **Footer**: tool version, scoring version, rules version; timestamp only when
    `includeTimestamp` (determinism — mirrors json/sarif).
- **HTML-escape ALL user-derived strings** (finding messages, file paths,
  suggestions, axis names) via a local `esc()` (`& < > " '`). A finding message
  containing `<script>` or `"` must not break the document or inject. This is the
  one real correctness requirement.
- Numbers/enums (score, grade, severity) are not user-controlled → safe, but
  still rendered through the same path.

**CLI wiring — `cli.ts`:**
- Add `html` to the `--format` description.
- New dispatch branch (sibling of the `sarif` branch, ~line 403): `format === "html"`
  → `renderHtml(result, { includeTimestamp })`; in `--output` mode write
  `lyse.html` into the out dir, else write to stdout.
- `html` counts as a machine/non-text format for the spinner-suppression logic
  (like json/sarif) so progress noise doesn't corrupt piped HTML.

## Error handling

- Score "N/A" / grade N/A → rendered as "N/A" (no crash; the not-a-DS / no-axes
  cases produce a valid HTML page saying N/A).
- Zero findings → a "No findings 🎉" state, valid HTML.
- Determinism: same `AuditResult` (no timestamp) → byte-identical HTML.

## Testing (TDD)

- **`renderHtml` (pure):**
  - contains the score number + grade label + each axis name + a findings row;
  - **escaping**: a finding message `<script>alert(1)</script>"x` appears
    escaped (`&lt;script&gt;…`), never raw — asserts no injection;
  - N/A score → page contains "N/A", no `NaN`/`undefined`;
  - deterministic: two renders of the same result are byte-identical (no timestamp);
  - self-contained: output contains no `http://`/`https://` `src=`/`href=` to a
    CDN (assert no external resource references) — i.e. no network dependency.
- **CLI smoke:** `lyse audit fixtures/full-ds --format=html` prints `<!doctype html`
  and the score; `--format=html --output <dir>` writes `lyse.html`.
- Full suite + smoke unchanged (json/sarif/text paths untouched).

## Docs

- `docs/guide/cli-reference.md`: add `html` to the `audit --format` options + a one-liner.
- `CHANGELOG` `[Unreleased]` → `### Added`.

## Scope / YAGNI

- No charts/JS interactivity (static HTML + CSS bars only — self-contained, simple, robust).
- No trend/history view (separate concern; the report is a single-audit snapshot).
- No theming/branding options.
- Reuse the json reporter's sort + the badge's color map (DRY, visual consistency).

## Honest limits

- Static snapshot (no interactivity); large finding sets are capped in the HTML
  (full set via `--format=json`) — documented in the footer note.
