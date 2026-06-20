# `components/doc-comments`

> **Axis:** Components · **Severity:** info · **Auto-fixable:** no · **Status:** stable (scored in v1)

Flags **public-API** PascalCase components — those re-exported from their package's entry — that carry no leading JSDoc (`/** … */`) doc comment.

## Why

A design system's components are its public API. A JSDoc doc comment on a public component is what surfaces in IDE tooltips, what TypeDoc renders, and what AI coding agents read to decide whether and how to use the component. An undocumented public export forces every consumer to read the source.

Scope is deliberately the **public API only** — the names a package actually re-exports from its entry, resolved per package so a demo component is never flagged because a sibling package exports the same name. Internal building blocks and example/demo components carry no documentation obligation toward consumers, so flagging them is noise. When the public surface cannot be resolved, the rule abstains (N/A).

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

- **Internal / demo / example components** not re-exported from the package entry (the public-API scope).
- Non-component PascalCase exports — `createContext(...)`, plain objects, theme constants.
- Non-Pascal exports — hooks (`useThing`), `SCREAMING_CASE` constants.
- Re-exports — `export { Button } from './Button'` (no local declaration).
- Files that are not `.tsx` / `.jsx`.
- Test / story / fixture / `demos/` / `examples/` files.
- Packages whose public surface cannot be resolved (the rule is N/A).

## Allowlist

```
// lyse-disable-next-line components/doc-comments
```

## Status

**Stable (scored in v1).** Promoted 2026-06-20, demoted after a corpus flood, then **re-scoped to the public API and re-promoted** (2026-06-20): per-package scoping eliminated the ~3585-finding flood (mantine: 3585 → 14 true positives, 0 false positives across 5 real DS) and both synthetic gates clear (recall LB 0.901 / precision LB 0.929).

## See also

- [`components/contracts-strictness`](./components-contracts-strictness.md) — typed prop contracts for the same components.
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
