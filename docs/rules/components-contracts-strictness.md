# `components/contracts-strictness`

> **Axis:** Components · **Severity:** error (`any`/`unknown` props) and warning (variant-as-string, missing `.d.ts`) · **Auto-fixable:** no · **Version:** v1

Component prop signatures and package `types` declarations are the contract surface that AI coding agents and IDE tooling read to suggest correct usages. This rule detects two classes of laxness that make that contract useless:

1. **Untyped props** — props declared as `any` or `unknown` (no useful constraint).
2. **Variant-as-string** — props named like a design-system variant (`variant`, `size`, `intent`, `color`, `tone`, `appearance`, `kind`) typed plain `string` instead of a string-literal union.
3. **Missing `.d.ts`** — a publishable `package.json` without `types` / `typings`, or one whose value points at a file that does not exist on disk.

## Why

A TypeScript prop typed `any` or `unknown` is a black hole — the agent has nothing to constrain its output and falls back to guesses (`variant="huge"`, `size={42}`, `data={someRandomObject}`). A variant prop typed `string` is the same problem in a different shape: the type system tells the agent **any string is acceptable**, when in fact only `"primary" | "secondary" | "ghost"` is.

`.d.ts` shipping is the same story at the package boundary: without a declaration file, downstream consumers and agents fall back to untyped any-mode and lose every guarantee the source code put in.

The rule errors on `any` / `unknown` because they are silent footguns. Variant-string and missing `.d.ts` are warnings because they have narrow legitimate uses, and because the fix path differs.

## What it checks

The rule walks every `.tsx` / `.jsx` file in `ParsedFiles` and, for each exported PascalCase component (function declaration or arrow / function-expression `const`), extracts the first parameter's TypeScript prop signature. Inline `TSTypeLiteral` types are read directly; named references (`ButtonProps`) are resolved against same-file `interface` / `type` declarations. Cross-file references are skipped — they are deferred to v0.2 with the rest of the cross-file resolver.

For each prop:

- `any` / `unknown` → **error**. Allowlisted prop names (`children`, `ref`, `key`, `as`, `asChild`) are skipped because the framework supplies their types externally.
- Prop name matches `/^(variant|size|intent|color|tone|appearance|kind)$/i` AND type is plain `string` → **warning**. `type` is intentionally excluded — it is overwhelmingly used as an HTML passthrough (`<input type>`, `<button type>`) or as a discriminated-union tag, not as a DS variant.

For `package.json` discovery:

- Searches `package.json`, `packages/*/package.json`, and `apps/*/package.json` at the repo root.
- Skips `"private": true` packages and files with no `name` field.
- Skips packages with no `main` / `module` / `exports` / `types` / `typings` (treated as non-publishable).
- For each remaining `package.json`:
  - No `types` and no `typings` → **warning** (missing declaration).
  - `types` (or `typings`) points to a file that does not exist on disk → **warning** (the build didn't produce it, or the path is wrong).

## Examples

### Flagged

```ts
// ✗ Error — `any` and `unknown` props
interface BadProps {
  variant: string;       // ← warning: variant-like prop typed string
  size: any;             // ← error: any forbidden
  data: unknown;         // ← error: unknown forbidden
}
export function Button(props: BadProps) { return <button />; }
```

```json
// ✗ Warning — package.json publishes JS but no declaration file
{ "name": "@acme/ui", "main": "./dist/index.js" }
```

```json
// ✗ Warning — types field points at a file the build didn't produce
{ "name": "@acme/ui", "main": "./dist/index.js", "types": "./dist/index.d.ts" }
// (dist/index.d.ts does not exist on disk)
```

### Not flagged

```ts
// ✓ All props strictly typed
type ButtonVariant = "primary" | "secondary" | "ghost";
interface ButtonProps {
  variant: ButtonVariant;
  size: "sm" | "md" | "lg";
  onClick?: () => void;
  children: React.ReactNode;     // children is framework-allowed
}
export function Button(props: ButtonProps) { return <button />; }
```

```json
// ✓ Declares types AND the file exists
{ "name": "@acme/ui", "main": "./dist/index.js", "types": "./dist/index.d.ts" }
```

## Allowlist

- Framework-allowed prop names — `children`, `ref`, `key`, `as`, `asChild`. Rest-spread (`...rest`) and ref-forwarded types are skipped because they aren't extracted as named `TSPropertySignature` members.
- Private packages (`"private": true`) and non-publishable `package.json` files (no `name` / `main` / `module` / `exports` / `types` / `typings`).
- Test files matching `.test.tsx` / `.spec.tsx`.
- Inline suppression directives — `// lyse-disable-next-line components/contracts-strictness` or `/* lyse-disable components/contracts-strictness */`, handled by the global suppression engine in `packages/core/src/suppression/inline.ts`.

## Known limitations (v0.1)

- **Cross-file prop type resolution.** A component declared `export function Button(props: ButtonProps)` where `ButtonProps` is imported from another file is skipped — the rule does not follow imports. This is the same limitation as the existing component-inventory loader; v0.2 lands a shared cross-file resolver.
- **Intersection / generic / conditional types.** Only `TSAnyKeyword`, `TSUnknownKeyword`, `TSStringKeyword`, `TSTypeLiteral`, and same-file `TSTypeReference` are recognised. `Pick<X, "...">`, `X & { … }`, and similar shapes are passed through without per-member analysis.
- **`types` is the only declaration channel checked.** The newer `exports.types` conditional in `package.json` is not yet read; v0.2 will add support.

## Related rules

- `naming/component-pascalcase` — symmetric rule for component naming hygiene (same DS surface, same AI-consumability theme).
- `ai-surface/ds-index-exported` — covers the package-level discoverability surface (single index entry).
- `ai-surface/component-manifest-json` — covers the static manifest surface for MCP tools.
