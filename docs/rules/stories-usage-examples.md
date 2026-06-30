# stories/usage-examples

**Axis:** stories  
**Severity:** warning  
**Status:** experimental — unmeasured, does not contribute to the Health Score

## What it flags

A DS component that **has** a Storybook story but whose story shows no usage examples is flagged.

"Shows usage examples" means at least one of:

1. The story file contains **two or more named story exports**, e.g.:
   ```ts
   export const Primary = {};
   export const Secondary = {};
   ```
2. At least one named story export carries a **non-empty `args` object**, e.g.:
   ```ts
   export const Primary = { args: { variant: "primary" } };
   ```

A single bare export with no `args` (`export const Primary = {};`) is not a usage example — it renders the component in its default state but demonstrates no configuration or variant.

## What it does NOT flag

- Components **not** in `componentInventory` (never imported in the codebase).
- Inventory components that have **no story at all** — that boundary belongs to [`stories/coverage`](./storybook-coverage.md).
- Stories with two or more named exports, regardless of whether they carry `args`.
- Stories with a single export that carries at least one `args` key.

## Zero-overlap boundaries

| Concern | Owned by |
|---------|----------|
| Component has no story | `stories/coverage` |
| Story exists but documents no props | `stories/props-documented` |
| Story exists but shows no usage examples | `stories/usage-examples` (this rule) |

## Why it matters

A consumer — human or AI agent — learns how to use a component from its story examples. A story with a single undifferentiated render teaches nothing about the component's variants, states, or configuration. Two or more named exports (e.g. `Primary`, `Disabled`, `Loading`) or at least one export with concrete `args` both satisfy the rule.

## Honest status note

This rule is **experimental and unmeasured**. Real-world precision against OSS design systems has not been harvested. It will not contribute to the Health Score until precision and recall clear the 0.90 Wilson lower-bound threshold. The finding severity is `warning` throughout the experimental period.
