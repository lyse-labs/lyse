# Sub-project B3 — components/standardized-variant-props — Design

> Socle sub-project after C3. Flags the "boolean explosion" variant
> antipattern — mutually-exclusive visual variants encoded as separate boolean
> props instead of one `variant` union. Stacked on `feat/color-to-90`.

## Goal

A DS component that encodes its visual variants as several boolean props
(`<Button primary secondary danger>`) gives an AI agent no enumerable
vocabulary and permits nonsensical combinations. The standard is a single
`variant` union (`variant: "primary" | "secondary" | "danger"`). B3 adds
`components/standardized-variant-props`, which flags a component declaring
**two or more** mutually-exclusive style-modifier booleans. Born
`experimental` / `contributesToScore: false`. 90% precision is the later
measurement campaign, not this sub-project.

## Why this, and why it does not overlap

`components/contracts-strictness` already owns the *type quality of an existing
variant prop*: it flags `variant: string` (a variant-like prop typed plain
string) and tells you to make it a string-literal union. B3 is orthogonal — it
flags the *structural absence* of a variant prop, replaced by a spread of
boolean style flags. A component can fail one and pass the other:

- `interface P { variant: string }` → contracts-strictness fires, B3 does not.
- `interface P { primary?: boolean; danger?: boolean }` → B3 fires,
  contracts-strictness does not (no `variant` prop to type-check).

Different finding, different fix, no double-flagging.

## Detection

For each exported PascalCase component, collect its **boolean-typed** props
whose names are in a curated **style-modifier vocabulary** (mutually-exclusive
visual variants). When a component declares **≥ 2** such booleans → one finding
("collapse these mutually-exclusive boolean flags into a single `variant`
union").

Curated vocabulary (case-insensitive exact match on the prop name):

```
primary, secondary, tertiary, danger, destructive, success, warning, info,
ghost, outline, outlined, link, solid, subtle, plain, neutral, accent, filled,
muted
```

Design choices that keep false positives low:

- **≥ 2 threshold.** A single `primary?: boolean` is a common, acceptable
  shorthand; the antipattern is the *explosion* (≥ 2 mutually-exclusive style
  booleans on one component).
- **Allowlist, not denylist.** Only names in the curated vocabulary count.
  Generic state booleans (`disabled, loading, active, selected, checked, open,
  fullWidth, block, rounded, required, readOnly, autoFocus, …`) are never
  matched, so they never trigger the rule.
- **Boolean-typed only.** A prop counts only when its type is `boolean`
  (`typeText === "boolean"`). A union/string/number prop named `primary` does
  not count.

## Architecture

Mirror `components/contracts-strictness` (`src/rules/components-contracts-strictness.ts`):
- Scan `ParsedFiles.ts` directly for exported PascalCase component
  declarations and their prop type members — reuse the existing component/prop
  discovery in that rule (its exported `scanComponentContracts` / `_internal`
  helpers, or the prop extractor in `src/loaders/components.ts`).
- Do NOT rely on `componentInventory`: the rule's primary target is the DS repo
  itself, where internal components are imported by relative path and may be
  absent from the module-import-derived inventory.
- No `dsSelfMode` skip — a DS-self audit is exactly where this rule should run.
- `opportunities` = exported PascalCase components inspected (the same
  denominator convention `contracts-strictness` uses), so the axis reports N/A
  when there are no components to judge.

Finding: `ruleId: "components/standardized-variant-props"`, axis `components`,
severity `warning`, location at the component declaration, message naming the
component and the offending boolean props, suggestion to use a `variant` union.

## Testing

TDD. Vitest, mirroring `components-contracts-strictness.test.ts`'s
`ParsedFiles` harness.

- bad: `interface BtnProps { primary?: boolean; danger?: boolean; ghost?: boolean }`
  on an exported `Button` → flag (≥ 2 style booleans).
- good: `interface BtnProps { variant?: "primary" | "danger" | "ghost"; disabled?: boolean }`
  → no flag (a union + a generic boolean).
- good: single `primary?: boolean` alone → no flag (below threshold).
- good: `disabled?: boolean; loading?: boolean` → no flag (generic state
  booleans, not in the vocabulary).
- good: a style-modifier name that is NOT boolean (`primary: "a" | "b"`) → not
  counted.

Catalogue parity (new sub-axis entry + coverage classification + regenerated
`rules-manifest.json`), construction-oracle adapter at Youden J = 1 (no
`falseFriends`), full suite green, `validate:autonomous` ENGINE GATE PASS,
default audit score UNCHANGED (off-score).

## Honest measurement posture

Born `experimental` / `contributesToScore: false`, catalogue unmeasured
(`null` / `nSamples: 0` / `lastCalibrated: null` / `llmDriven: false`). The
adapter carries no `falseFriends`, so the catalogue-coherence test allows the
null entry (the program-wide pattern for experimental rules). Real promotion to
90% precision via the later harvest campaign.

## Global constraints

- Strict TS (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`,
  `verbatimModuleSyntax`); ESM `.js` import specifiers. Determinism (pure AST
  over fixed input; no `Date.now()`/`Math.random()`). No LLM. No comments
  unless WHY is non-obvious. English only.
- Rule via `createLyseRule`; full registration + regenerated manifest + docs +
  `BuiltInRuleId` union entry. No score change.
- Conventional Commits; branch `feat/color-to-90`.

## Non-goals

- Cross-component value-vocabulary consistency (size sm/md/lg vs
  small/medium/large) — deferred as too FP-prone (legitimate per-component
  scales). B3 is the boolean-explosion antipattern only.
- Re-checking what `contracts-strictness` owns (variant-as-string-vs-union).
- The bundled v2→v3 score bump and the measurement campaign (later phases).
