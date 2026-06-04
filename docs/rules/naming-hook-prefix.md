# `naming/hook-prefix`

> **Axis:** Components · **Severity:** warning · **Auto-fixable:** yes (high-confidence cases) · **Version:** v1

Custom React hooks must start with `use` followed by an uppercase letter. A function that calls other hooks (or lives in a hooks-shaped path) without the `use` prefix bypasses `eslint-plugin-react-hooks` and the React runtime's Rules-of-Hooks enforcement — silently broken until it crashes at runtime under conditional or loop call sites.

## Why

React decides whether a function is a hook by inspecting its name. `useMyData` is treated as a hook; `getMyData` is treated as a plain function — even if the body calls `useState` and `useEffect`. The cost of the mis-classification:

1. `eslint-plugin-react-hooks` skips its checks → conditional/loop hook calls are silently legal under lint.
2. The function will still throw at runtime when React's invariants are violated.
3. Downstream developers don't know the function has hook semantics and may call it in non-hook contexts.

## Evidence model

To avoid false positives on pure utility functions, the rule flags an exported function as a misnamed hook only when at least ONE piece of evidence is present:

- **Body-call evidence** — the function body contains a top-level call to a `use<Upper>(` identifier. The matcher:
  - streams the full body (no length cap) so hooks whose first `use*` call sits far inside a large body are caught;
  - rejects member-access calls (`obj.useStore(...)` is not a hook call on the enclosing function);
  - rejects calls that live inside a nested `function` declaration or arrow function body.
- **Path-evidence** — the file lives under `**/hooks/**` AND the function name matches the filename's advertised hook target (`toggle` in `use-toggle.ts`, `combineRef` in `use-combine-ref.ts`). Co-located helpers with unrelated names (e.g. `composeRefs` in `use-combine-ref.ts`, `topoSort` in `compute-engine.ts`) do NOT trigger path-evidence and must show body-call evidence to fire.

Without any evidence, the rule does NOT flag. A pure utility named `flattenTree` in a `.tsx` file remains a utility — renaming it to `useFlattenTree` would actively break the codebase by triggering Rules-of-Hooks enforcement on a function that is not, in fact, a hook.

## Examples

### Flagged

```ts
// Body-call evidence
export function userStats(id: string) {
  const data = useUserData(id);
  return data.count;
}
// → Suggestion: rename to `useUserStats`

// Path-evidence (apps/foo/src/hooks/use-toggle.ts — filename target `toggle` matches)
export function toggle() { return !state; }
// → Suggestion: rename to `useToggle`
```

### Not flagged

```ts
// Pure utility, no hook call, no hooks/ path
export function flattenTree(t: TreeNode) { return t.flat(); }

// Co-located helper in hooks/, but name does NOT match filename target
// (apps/foo/src/hooks/use-combine-ref.ts → expected `combineRef`, got `composeRefs`)
export function composeRefs(...refs) { return refs; }

// `useStore` is a method on `ctx`, not a top-level hook call
export function readState(ctx: Ctx) { return ctx.useStore(s => s.x); }

// Hook call lives inside a nested inner function
export function makeCallback() {
  function inner() { useEffect(() => {}, []); }
  return inner;
}
```

## Allowlist

- PascalCase exports (those are components, handled by `naming/component-pascalcase`).
- HOC patterns (`withXxx`).
- Functions in `.test.ts` / `.spec.ts` files.
- Non-exported helpers.

## Auto-fix

When confidence is `high`, `lyse fix` renames the declaration and same-file references to `use<CapitalizedName>`. Cross-file callers must be updated separately. Names containing `_` or `-` are classified `medium` confidence and skipped by default.

## Related rules

- `naming/component-pascalcase` — symmetric rule for component naming.

## Shared helpers

Body-analysis primitives (`bodyCallsHook`, `bodyReturnsJsx`, `fileIsInHooksDir`, `filenameMatchesFunction`) live in `packages/core/src/rules/_function-body-analysis.ts` and are reused by `naming/component-pascalcase`.
