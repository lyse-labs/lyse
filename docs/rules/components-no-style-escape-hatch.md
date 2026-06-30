# `components/no-style-escape-hatch`

> **Axis:** Components · **Severity:** warning · **Auto-fixable:** no · **Status:** experimental (not scored)

Flags an inline `style` prop on a design-system component. Any value is flagged — the problem is the escape hatch itself, not the specific value.

## Why

DS components expose a deliberate prop API (variant, size, color, sx, …) precisely so that consumers never need to reach for `style`. An inline `style` prop is the runtime equivalent of `!important`: it bypasses variant tokens, breaks dark-mode cascade, and survives token renames silently.

When an AI coding agent produces `<Button style={{ color: "#2563eb" }}>`, it has ignored the DS contract. When a human writes it, they have taken a shortcut that accumulates into drift no token tooling can catch.

## What is flagged

Any JSX opening or self-closing element whose tag is a **DS component** (imported from `designSystem.componentsModule` or listed in `componentInventory`) and that carries a `style` attribute.

The rule is **value-agnostic** — both of the following flag:

```tsx
<Button style={{ color: "red" }} />
<Button style={{ margin: 0, padding: "4px" }} />
```

## What is NOT flagged

```tsx
// Raw HTML — not a DS component
<div style={{ color: "red" }} />

// DS component, no style prop
<Button variant="primary" />

// dsSelfMode=true — auditing the DS itself (internal implementation)
// No findings produced; the rule returns N/A.
```

## Bad

```tsx
import { Button } from "@org/ui";

export const Page = () => (
  <Button style={{ color: "#2563eb", fontWeight: 700 }}>Save</Button>
);
```

## Good

```tsx
import { Button } from "@org/ui";

// Use the component's prop API
export const Page = () => (
  <Button variant="primary" size="md">Save</Button>
);

// Or, if the DS exposes an sx/className prop for escape-hatch customisation,
// prefer that over style (token-aware, themeable).
```

## DS-self mode

When `lyse audit` detects that the repo being scanned **is** the design system (a DS-export package is present in the same monorepo), the rule returns N/A. DS component implementations necessarily use `style` internally — that is not consumer drift.

## Status

Experimental — not yet scored. Precision/recall will be calibrated in a future harvest step once OSS design-system consumer repos are sampled.

## See also

- [`components/no-native-shadows`](./components-shadow-native.md) — native HTML where a DS component exists
- [`components/no-arbitrary-tailwind`](./components-no-arbitrary-tailwind.md) — arbitrary Tailwind values
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
