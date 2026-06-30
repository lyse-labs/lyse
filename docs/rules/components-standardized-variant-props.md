# `components/standardized-variant-props` — Variants as a single union, not boolean explosion

**Axis:** components · **Severity:** warning · **Status:** experimental (off-score, unmeasured)

## What it checks

Scans exported PascalCase component function declarations in `.ts` / `.tsx` files for the "boolean explosion" antipattern: declaring **two or more** mutually-exclusive visual-modifier flags as separate `boolean` props.

```tsx
// flagged: primary, ghost, danger are three separate booleans
interface ButtonProps {
  primary?: boolean;
  ghost?: boolean;
  danger?: boolean;
}
export function Button(props: ButtonProps) { ... }
```

The rule fires when **≥ 2** prop names from the style-modifier vocabulary (see below) are each typed `boolean` (or `boolean | undefined`).

## Why it matters

A component with `primary`, `secondary`, and `danger` boolean props lets a caller set several at once — `<Button primary danger>` is syntactically valid, semantically nonsensical. More importantly, it gives an AI agent **no closed enumerable vocabulary**: the agent cannot know which values are valid without reading prose documentation.

A single `variant` string-literal union is mutually exclusive by construction and self-documenting:

```tsx
// good: one variant union
interface ButtonProps {
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;    // generic state boolean — not matched
}
```

## Style-modifier vocabulary

Only names in this curated allowlist are counted. Generic state booleans (`disabled`, `loading`, `active`, `selected`, `fullWidth`, `rounded`, …) are **absent on purpose** so they are never matched.

| Vocabulary |
|---|
| `primary`, `secondary`, `tertiary` |
| `danger`, `destructive` |
| `success`, `warning`, `info` |
| `ghost`, `outline`, `outlined`, `link` |
| `solid`, `subtle`, `plain`, `neutral`, `accent` |
| `filled`, `muted` |

## Threshold

A **single** style-modifier boolean (e.g., only `primary?: boolean`) is a common, acceptable shorthand — the rule fires **only at two or more**.

## What it skips (allowlist)

- Generic state booleans (`disabled`, `loading`, `active`, `selected`, `fullWidth`, `rounded`, …) — not in the vocabulary.
- A single style-modifier boolean (below the ≥2 threshold).
- Style-modifier names that are **not** typed `boolean` (e.g., `primary?: "a" | "b"` is not matched).
- Components with no TypeScript type annotation on the props parameter.
- Non-PascalCase function exports (utilities, hooks).
- Cross-file type references (not resolved in v0.1; same limitation as `components/contracts-strictness`).

## Relationship to `components/contracts-strictness`

These two rules are **orthogonal**:

- `contracts-strictness` checks that an existing `variant` prop uses a string-literal union instead of plain `string` (or `any`).
- `standardized-variant-props` checks that the variant axis is represented as **a single prop** at all, rather than as multiple booleans.

A component can violate one without violating the other:
- `variant: string` → `contracts-strictness` fires, `standardized-variant-props` does not.
- `primary?: boolean; danger?: boolean` → `standardized-variant-props` fires, `contracts-strictness` does not.

## Status note

This rule is **experimental and unmeasured**: real-world precision has not been harvested from a benchmark corpus. It does not contribute to the Lyse Health Score. It will be promoted to `stable` after a calibration run against the bench that clears the 0.90 Wilson lower bound on both precision and recall.
