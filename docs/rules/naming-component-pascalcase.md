# `naming/component-pascalcase`

> **Axis:** Components · **Severity:** warning · **Auto-fixable:** yes (high-confidence cases) · **Version:** v1

Exported React/Vue/Solid components must be named in PascalCase. A component named `myButton` instead of `MyButton` is silently treated as an unknown HTML element by the JSX runtime — it renders as `<mybutton>` and breaks the component model with no compile-time error.

## Why

JSX distinguishes components from HTML elements by case:

- `<myButton>` → unknown DOM element, renders as a literal `<mybutton>`.
- `<MyButton>` → component invocation, renders the component.

A camelCase or snake_case component is a silent bug: the file lints, types pass, and the runtime emits an unknown element. The fix is mechanical — rename the declaration and intra-file references.

## Evidence model

To avoid false positives on factories, getters, and TS-generic-heavy utilities that live in `.tsx` files (a common source of FPs on real codebases like an internal-audit corpus repo), the rule flags an exported non-PascalCase function only when at least ONE piece of evidence is present:

- **JSX-return evidence** — the function's OUTER body (with nested function bodies stripped) contains a JSX-returning expression. Any of the following count:
  - direct `return <Tag …>` where `Tag` is an uppercase identifier (`<Suspense />`, `<Layout>`), a known HTML / SVG tag (`<div>`, `<button>`, `<svg>`), or a fragment (`<>…</>`);
  - implicit-return arrow body: `export const X = (...) => <Tag …>`.
- **displayName evidence** — the source contains `<name>.displayName = …`.

Object-literal returns are treated as **factories**, not components: `return { h1: () => <h1/> }` does NOT count as JSX evidence for the outer function. The matcher blanks out the contents of `return {…}` before scanning, so JSX inside the object's values is ignored.

The JSX matcher is shared with `naming/hook-prefix` via `_function-body-analysis.ts` (`bodyReturnsJsx`). It disambiguates JSX element opens from TS type-position generics: `return useMemo<Foo>(…)`, `return dynamic<T>(loader)`, `return Array<X>(10)` are NOT counted as JSX.

Nested JSX inside an inner function does not count for the OUTER function — a factory like `dynamic<T>` that returns a nested `function Dyn(props) { return <Suspense/>; }` is correctly classified as a factory, not as a misnamed component.

## Examples

### Flagged

```tsx
// Returns a real JSX element
export function myButton(props) {
  return <button {...props} />;
}
// → Suggestion: rename to `MyButton`

// Implicit-return arrow with JSX body
export const myCard = (props) => <div className="card" {...props} />;
// → Suggestion: rename to `MyCard`

// snake_case component
export const my_card = () => <div className="card" />;
// → Suggestion: rename to `MyCard`

// Uses displayName
export const myWidget = () => null;
myWidget.displayName = "MyWidget";
// → Suggestion: rename to `MyWidget`
```

### Not flagged

```tsx
// Factory that returns a component — outer body has no JSX of its own
export function dynamic<T>(loader) {
  return function Dyn(props) {
    return <Suspense fallback={null} />;
  };
}

// Getter returning a plain object, despite living in a .tsx file
export function getUser(id) {
  return db.users.find(id);
}

// TS generic at return — NOT JSX
export function useMemoize<T>(fn: () => T) {
  return useMemo(fn, []);
}

// HOC pattern
export function withRouter(Comp) { return <Comp />; }

// Hooks — handled by `naming/hook-prefix`
export function useMyHook() { return null; }

// Implicit-return arrow whose body is NOT JSX
export const formatLabel = (text: string) => text.toUpperCase();

// Wrapper call whose first argument is NOT JSX
export function getDeps() { return cache(() => fetchDeps()); }

// Object-of-JSX factory (MDX components, render maps, …)
export function getMdxComponents() {
  return {
    h1: ({ children }) => <h1>{children}</h1>,
    h2: ({ children }) => <h2>{children}</h2>,
  };
}
```

## Allowlist

- HOC patterns starting with `with` (`withRouter`, `withTheme`).
- Test utilities in `.test.tsx` / `.spec.tsx` files.
- Hooks starting with `use` (handled by `naming/hook-prefix`).
- Non-JSX-returning utilities in `.tsx` files.

## Auto-fix

When confidence is `high`, `lyse fix` renames the declaration and intra-file references. Cross-file imports must be updated separately. Names containing `_` or `-` are classified `medium` confidence and skipped by default.

## Known limitations (v0.1)

- **Wrapper-call patterns are NOT flagged.** Functions whose only JSX appears as an argument to a wrapper call — e.g. `return render(<Email/>)`, `return renderToString(<App/>)`, `return mount(<Component/>)` — are intentionally ignored. Without type information the rule cannot distinguish wrappers that **return** JSX (rare) from wrappers that **consume** JSX and return a string / handle / void (React Email's `render`, ReactDOMServer's `renderToString`, testing-library's `render`). Flagging this signature produces a high false-positive rate on real codebases (one audit corpus repo: 22/26 FPs). Revisited later with a TS-AST + type-info pass.

## Related rules

- `naming/hook-prefix` — symmetric rule for hook naming.

## Shared helpers

Body-analysis primitives (`bodyReturnsJsx`, `bodyCallsHook`, `arrowImplicitReturnsJsx`, `fileIsInHooksDir`) live in `packages/core/src/rules/_function-body-analysis.ts` and are shared with `naming/hook-prefix`.
