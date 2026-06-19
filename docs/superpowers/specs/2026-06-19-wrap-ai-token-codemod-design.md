# wrap-ai-token codemod — design

> Issue: lyse-labs/lyse-internal#92 (fix/ai-readiness-codemods) — the 2 remaining JSX-mutating codemods.
> Status: approved (Noé, 2026-06-19, brainstorming). Scope: **high-confidence deterministic only.**

## Goal

A `lyse fix` codemod that resolves an `ai-governance/ai-token-requires-marker`
finding by inserting a `data-ai` attribute on the JSX opening tag of the element
that uses the reserved AI token — but only in the unambiguous, deterministic
case. Behind the existing 6 safety guards; high-confidence so it runs by default.

## Scope decision

- **wrap-ai-token (data-ai attribute insertion)** — SHIPPED. Adding `data-ai` is
  the rule's own sanctioned fix (its suggestion says "annotate the element with
  `data-ai`") and is recognised by the rule's `DATA_AI_ATTR_RE`
  (`/\bdata-ai(?:-[a-z][a-z0-9-]*)?\b/`), so the fix genuinely clears the finding.
  Adding an *attribute* is non-structural (unlike wrapping in a marker
  *component*, which changes the render tree) → safe enough to be high-confidence.
- **disclaimer/feedback-insert (in-JSX)** — NOT shipped. Structural insertion of a
  component into arbitrary user JSX is placement-ambiguous and FP-prone; it cannot
  be done high-confidence. The doc-level need is already met by the shipped
  `scaffold` slice (`AI_GOVERNANCE.md` etc.). #92's exit gate ("every (a)-fixable
  gap has a codemod **or scaffold**") is satisfied by the scaffold.

## The constraint that shapes the design

The rule's finding is **file-level**: `location: { file: rel, line: 1, column: 1 }`
— it does NOT pin the offending element. So the codemod must **re-locate** the
reserved-token usage itself, then find the enclosing opening tag. This is only
safe when the location is unambiguous.

## Mechanism

Input: file `source` + the finding (ruleId `ai-governance/ai-token-requires-marker`).

1. **Re-detect reserved AI-token references** in the source using the same
   patterns the rule uses (`var(--ai-*)`, bare `--ai-*`, `--p-color-*-magic*`,
   and the other reserved forms `detectReservedAiTokens` recognises). Collect
   every match offset.
2. **Bail to NO_FIX unless exactly one** reserved-token reference exists (more
   than one → ambiguous which element to annotate; zero → nothing to do).
3. From that single reference offset, **scan backward to the nearest enclosing
   JSX opening tag** on the same logical element: the last `<` + tag-name start
   before the reference for which the matching `>` is at/after the reference
   (i.e. the reference sits inside that tag's attributes, e.g. inline `style`).
   Require the opening tag's `<Tag …>` to be locatable on a single line.
4. **Bail to NO_FIX** if: the opening tag can't be located on one line; the tag
   already carries a `data-ai`/`data-ai-*` attribute (idempotent no-op); or the
   reference is not inside a JSX opening tag (e.g. token used in a non-JSX
   expression) — these are the ambiguous/structural cases we refuse.
5. **Insert ` data-ai`** immediately after the tag name (`<div` → `<div data-ai`).
   Emit a `singleLineDiff` for that line. `importsAdded: []` (attribute, no import).

## Confidence

- **high** — exactly one reserved-token reference, single-line enclosing opening
  tag located, no existing `data-ai*`. (Runs by default under guard-4's high floor.)
- otherwise **NO_FIX** (empty diff). The codemod never guesses placement.

## Integration

- New file `packages/core/src/codemods/ai-token-requires-marker.ts` exporting the
  codemod function in the existing codemod shape (mirror `shadow-native.ts`:
  takes the file source + finding, returns `{ patch/diff, confidence, rationale/warnings }`).
- Wire it into `packages/core/src/codemods/index.ts` (`applyCodemod` switch) under
  `case "ai-governance/ai-token-requires-marker"`, matching how `shadow-native`
  and the token codemods are dispatched.
- No change to the rule's `evaluate` or `classifyConfidence`.

## Testing (TDD)

Codemod unit tests (mirror an existing codemod test):
- Single inline-style token (`<div style={{ background: 'var(--ai-surface)' }}>`) →
  diff inserts ` data-ai` after `<div`, confidence high.
- Two reserved-token references in the file → NO_FIX (ambiguous).
- Tag already has `data-ai` → NO_FIX (idempotent).
- Reserved token used outside any JSX opening tag → NO_FIX.
- Opening tag spans multiple lines → NO_FIX (not single-line-locatable).

## Out of scope

- Wrapping in a marker *component* (structural; low-confidence) — not done.
- disclaimer/feedback in-JSX insertion — not done (scaffold-covered).
- Vue `<template>` mutation — JSX/TSX only (the rule's marker detection already
  handles `.vue`, but the codemod targets the JSX/TSX opening-tag case; Vue
  templates → NO_FIX).
- Changing the rule's file-level finding location (kept as-is; the codemod
  re-locates). A future improvement could record the token line in the finding.

## Exit gate (this cycle)

wrap-ai-token codemod shipped behind the 6 guards, high-confidence, with tests +
CHANGELOG. #92's disclaimer slice resolved as scaffold-covered. #92 closeable.
