# `a11y/semantic-html`

> **Axis:** A11y · **Severity:** warning · **Auto-fixable:** no · **Status:** scored (v1)

Flags native elements that carry a click handler but have no semantic role.

## Why

A clickable `<div>` works for mouse users and no one else: it's not focusable, doesn't fire on Enter/Space, and a screen reader announces nothing actionable. Using the right element — `<button>` — gives keyboard operability, focus, and role for free. When a non-semantic element must be interactive, it needs `role`, `tabIndex`, and a key handler to be equivalent. This is the classic `no-static-element-interactions` accessibility bug.

## How

Walks JSX (`.tsx` / `.jsx`) for native lowercase elements (`div`, `span`, `li`, `section`, …) that carry a click handler (`onClick` / `onMouseDown` / `onMouseUp`) but **no** `role` attribute.

Exempt: native interactive elements (`button`, `a`, `input`, `select`, `textarea`, `option`, `details`, `summary`), custom PascalCase components (where `onClick` is a prop, not a DOM handler), and elements that already declare a `role`.

## Bad

```tsx
<div onClick={save}>Save</div>
```

## Good

```tsx
<button onClick={save}>Save</button>
// or, when a non-semantic element must be interactive:
<div role="button" tabIndex={0} onClick={save} onKeyDown={onKey}>Save</div>
```

## What does NOT trigger this rule

- Native interactive elements with handlers (`<button onClick>`, `<a onClick>`).
- A static element that already declares a `role`.
- Custom components (`<Card onClick>`) — `onClick` is a prop.
- A static element with no click handler.

## Allowlist

```
lyse-disable a11y/semantic-html
```

## Status

**Scored (v1):** contributes to the Health Score. Promoted 2026-06-20 after clearing both gates on the synthetic recall suite (recall LB 0.934, precision LB 0.916).

## See also

- [`a11y/essentials`](./a11y-essentials.md) — the jsx-a11y core checks (this rule covers the static-interaction gap they don't).
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
