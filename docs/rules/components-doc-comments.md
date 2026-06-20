# `components/doc-comments`

> **Axis:** Components · **Severity:** info · **Auto-fixable:** no · **Status:** scored (v1)

Flags exported PascalCase components that carry no leading JSDoc (`/** … */`) doc comment.

## Why

A design system's components are its public API. A JSDoc doc comment on an exported component is what surfaces in IDE tooltips, what TypeDoc renders, and what AI coding agents read to decide whether and how to use the component. An undocumented export forces every consumer to read the source.

The check is **presence-only**: a one-line `/** A button. */` clears it. Judging the prose quality is the LLM layer's job, not the static engine's.

## How

Scans `.tsx` / `.jsx` files for exported components and reports each one without a leading JSDoc block:

- `export function Button() { … }` (function declarations)
- `export const Card = () => …` (arrow / function consts)
- `export const Input = forwardRef(…)` (HOC-wrapped via `forwardRef` / `memo` / `observer` / `styled`)
- `export default function Modal() { … }` (default-exported functions)

A leading comment counts only if it is a JSDoc block (`/** … */`) — a plain `/* … */` block or a `//` line comment does not, because only JSDoc is surfaced by IDE tooltips and TypeDoc.

## Bad

```tsx
export function Button() { return <button />; }
```

## Good

```tsx
/** Primary action button. */
export function Button() { return <button />; }
```

## What does NOT trigger this rule

- Non-component PascalCase exports — `createContext(...)`, plain objects, theme constants.
- Non-Pascal exports — hooks (`useThing`), `SCREAMING_CASE` constants.
- Re-exports — `export { Button } from './Button'` (no local declaration).
- Files that are not `.tsx` / `.jsx`.
- Test / story / fixture files.

## Allowlist

```
// lyse-disable-next-line components/doc-comments
```

## Status

**Scored (v1):** contributes to the Health Score. Promoted 2026-06-20 after clearing both gates on the synthetic recall suite (recall LB 0.901, precision LB 0.912).

## See also

- [`components/contracts-strictness`](./components-contracts-strictness.md) — typed prop contracts for the same components.
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
