# Sub-project C3 — story content quality — Design

> Next socle sub-project after C2 (`a11y/interactive-role-name`). Two rules
> that judge the CONTENT quality of Storybook stories a DS component already
> has — props documentation and usage examples. Stacked on `feat/color-to-90`.

## Goal

A DS consumer (human or AI agent) needs to learn, from a component's story,
(1) what props the component takes and (2) how to use it. Storybook is the
canonical doc surface. C3 adds two rules that judge those two qualities on
stories that **already exist** — leaving absence-of-a-story to
`stories/coverage` (zero overlap):

- `stories/props-documented` — the story documents the component's props.
- `stories/usage-examples` — the story shows real usage examples, not a single
  undifferentiated render.

Both born `experimental` / `contributesToScore: false`. 90% precision is the
later measurement campaign's job, not this sub-project's.

## Why these, and why they don't overlap

Existing, adjacent rules:

- `stories/coverage` — does an inventory DS component **have** a story at all?
  (existence). C3 judges only components that DO have a story → no overlap.
- `components/doc-comments` — JSDoc on the component declaration (source), a
  different surface than the story file.
- `ai-surface/component-manifest-completeness` (B1) — does the **lyse manifest**
  (JSON) document `props`/`examples`. Different artifact (manifest vs Storybook).

C3's surface is the Storybook story file's content, distinct from all three.

## Substrate (already exists)

`src/loaders/stories.ts` parses CSF into `StoryIndex { byTitle: Map<string, StoryEntry> }`.
`StoryEntry` carries `componentName?`, `stories?: StoryExport[]`; each
`StoryExport` carries `name` and best-effort literal `args`
(`Record<string, string|number|boolean>`). C3 reads this parsed data — no new
parsing pass for the rules.

## Loader extension (one small change)

Add `hasArgTypes: boolean` to `StoryEntry` (and populate it in
`src/loaders/stories.ts`). In the existing `ExportDefaultDeclaration` handler
(the same place `component` is read from the meta object), set `hasArgTypes`
true when the default-export object literal has an own property named
`argTypes` (presence only — the value is not inspected). Best-effort: absent /
non-object default export → `false`. This is the canonical CSF signal that a
story explicitly documents props/controls.

Existing `stories/coverage` only reads `byTitle.has(...)`, so it is unaffected
by the new field.

## Rule 1: `stories/props-documented`

- Axis `stories`, severity `warning`.
- `dsSelfMode` → return `{ findings: [], opportunities: 0 }` (DS repos use
  non-standard story formats — N/A).
- `storyIndex == null` → `{ findings: [], opportunities: 0 }` (axis N/A).
- For each `componentInventory` entry `c` where `storyIndex.byTitle.has(c.name)`:
  - `opportunities++`.
  - Let `entry = byTitle.get(c.name)`.
  - "Props documented" holds when `entry.hasArgTypes === true` OR some
    `entry.stories?[i].args` is a non-empty object.
  - When it does NOT hold → push one finding (the story exercises/documents
    zero props).
- Finding: `ruleId: "stories/props-documented"`, axis `stories`,
  `location: { file: "(inventory)", line: 0, column: 0 }`, message naming the
  component, suggestion to add `argTypes` or arg'd stories.

## Rule 2: `stories/usage-examples`

- Axis `stories`, severity `warning`.
- Same `dsSelfMode` / `storyIndex == null` N/A guards.
- For each inventory component with a story (`opportunities++`):
  - Let `n = entry.stories?.length ?? 0` and
    `anyArgs = entry.stories?.some(s => s.args && Object.keys(s.args).length > 0) ?? false`.
  - "Has usage examples" holds when `n >= 2` OR `anyArgs === true`.
  - When it does NOT hold (a single undifferentiated render, or zero named
    exports) → push one finding.
- Finding mirrors rule 1's shape with `ruleId: "stories/usage-examples"` and a
  suggestion to add named story exports / demonstrate variants.

The two rules are independent: a story with `argTypes` but a single bare
example fails `usage-examples` only; a story with several arg'd examples but no
`argTypes` passes both (args satisfy props-documented).

## Architecture / files

- Modify: `src/types.ts` (`StoryEntry.hasArgTypes`), `src/loaders/stories.ts`
  (populate it).
- Create: `src/rules/stories-props-documented.ts`, `src/rules/stories-usage-examples.ts`.
- Register: `src/rules/registry.ts`; `src/reliability/catalogue/sub-axes.ts`
  (two entries `stories.props-documented`, `stories.usage-examples`, status
  `experimental`, `contributesToScore: false`, all metrics `null`,
  `nSamples: 0`, `lastCalibrated: null`, `llmDriven: false`); coverage
  classification; regenerate `rules-manifest.json`.
- Create: `validation/adapters/stories-props-documented.ts`,
  `validation/adapters/stories-usage-examples.ts` (construction-oracle, **no
  `falseFriends`** so the catalogue-coherence test allows the null entry).
- Create: `docs/rules/stories-props-documented.md`,
  `docs/rules/stories-usage-examples.md`.

## Testing

TDD per rule. Vitest, mirroring how an existing storyIndex-consuming rule test
builds `RuleContext` (with `componentInventory` + `storyIndex`).

`stories/props-documented`:
- story with `argTypes` in meta → no flag.
- story with a named export carrying `args` → no flag.
- story with neither argTypes nor any args → flag.
- `dsSelfMode` → opportunities 0, no flag.
- `storyIndex == null` → opportunities 0, no flag.
- component not in inventory / no story → not counted (coverage's job).

`stories/usage-examples`:
- story with ≥2 named exports → no flag.
- story with 1 named export carrying args → no flag.
- story with a single bare export (no args) → flag.
- story with zero named exports → flag.
- `dsSelfMode` / `storyIndex == null` → opportunities 0.

Catalogue parity (two new entries), coverage completeness (`uncovered = []`),
regenerated `rules-manifest.json`, construction-oracle adapters at Youden J=1,
full suite green, `validate:autonomous` ENGINE GATE PASS, default audit score
UNCHANGED (both off-score).

## Honest measurement posture

Both rules ship `experimental` / `contributesToScore: false`, catalogue
unmeasured (null / nSamples 0). Their adapters carry NO `falseFriends`, so the
catalogue-coherence test allows the null entry (the pattern established across
the program's experimental rules). Real promotion to 90% precision via the
later harvest measurement campaign, not here.

## Global constraints

- Strict TS (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`,
  `verbatimModuleSyntax`); ESM `.js` import specifiers. Determinism (pure AST
  over fixed input; no Date.now/Math.random). No LLM. No comments unless WHY is
  non-obvious. English only.
- Rule via `createLyseRule`; full registration + regenerated manifest + docs.
- Conventional Commits; branch `feat/color-to-90`. No score change.

## Non-goals

- Resolving cross-file `component:`/`argTypes` variable references, or
  inspecting `argTypes` *contents* (presence only). Factory-pattern stories the
  loader already can't parse stay unparsed.
- `standardized-variant-props` (B3, next). The bundled v2→v3 score bump (later).
- Promotion / measurement (the later campaign).
