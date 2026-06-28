# stories/props-documented

**Axis:** stories  
**Severity:** warning  
**Status:** experimental — unmeasured, does not contribute to the Health Score

## What it flags

A DS component that **has** a Storybook story but whose story documents no props is flagged.

"Documents props" means at least one of:

1. The story's default export declares an `argTypes` object, e.g.:
   ```ts
   export default { component: Button, argTypes: { variant: { control: "select" } } };
   ```
2. At least one named story export carries a non-empty `args` object, e.g.:
   ```ts
   export const Primary = { args: { variant: "primary" } };
   ```

Both signals satisfy the rule; only the complete absence of both triggers a finding.

## What it does NOT flag

- Components **not** in `componentInventory` (never imported in the codebase).
- Inventory components that have **no story at all** — that boundary belongs to [`stories/coverage`](./storybook-coverage.md).
- Stories that use `args` on at least one named export even without `argTypes`.

## Zero-overlap boundaries

| Concern | Owned by |
|---------|----------|
| Component has no story | `stories/coverage` |
| Story exists but documents no props | `stories/props-documented` (this rule) |

## Why it matters

The story is the canonical documentation surface for a DS component. A story that exercises no props teaches a consumer — human or AI agent — nothing about the component's API. Both `argTypes` (Storybook Controls/Autodocs) and concrete `args` on named stories surface the prop API; the rule accepts either.

## Honest status note

This rule is **experimental and unmeasured**. Real-world precision against OSS design systems has not been harvested. It will not contribute to the Health Score until precision and recall clear the 0.90 Wilson lower-bound threshold. The finding severity is `warning` throughout the experimental period.
