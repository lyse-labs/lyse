# `a11y/essentials`

> **Axis:** A11y · **Severity:** warning · **Auto-fixable:** no · **Version:** v1

Enforces a curated subset of accessibility essentials, wrapping `eslint-plugin-jsx-a11y` rules treated as non-negotiable.

## Why

Accessibility is the highest-stakes axis in a design system. Mistakes here exclude real users, expose the company to legal risk (EAA, ADA, EU AI Act), and undermine user trust.

This rule does not invent new a11y heuristics. It reuses established `eslint-plugin-jsx-a11y` rules and selects a subset that maps to the [W3C WAI Easy Checks](https://www.w3.org/WAI/test-evaluate/preliminary/).

## Wrapped rules

Lyse activates these `eslint-plugin-jsx-a11y` rules under `a11y/essentials`:

| Sub-rule | What it catches |
|---|---|
| `alt-text` | `<img>` without `alt`, `<area>` without `alt`, `<input type="image">` without `alt`. |
| `anchor-has-content` | `<a>` with no accessible name. |
| `aria-props` | Invalid `aria-*` attributes. |
| `aria-proptypes` | `aria-*` attributes with values of the wrong type. |
| `aria-role` | Invalid `role` values, or abstract roles. |
| `aria-unsupported-elements` | ARIA on elements that don't support it. |
| `heading-has-content` | Empty `<h1>` … `<h6>`. |
| `html-has-lang` | `<html>` missing the `lang` attribute. |
| `iframe-has-title` | `<iframe>` without `title`. |
| `img-redundant-alt` | `alt` text duplicating the surrounding context ("image of …"). |
| `interactive-supports-focus` | Interactive elements (role) that cannot be focused. |
| `label-has-associated-control` | `<label>` without an associated `<input>`. |
| `no-noninteractive-element-interactions` | `onClick` on a `<div>` without `role`. |
| `no-redundant-roles` | `role="button"` on `<button>`. |

This is the v0.1.0 set. Future versions may add or remove sub-rules — version-bumped as `a11y/essentials@v2`, `v3`, etc.

## Bad

```tsx
function Avatar({ src }: { src: string }) {
  return <img src={src} />;  // missing alt
}

function Card({ onClick }: { onClick: () => void }) {
  return <div onClick={onClick}>Click me</div>;  // no role, no keyboard
}

function ExternalLink() {
  return <a href="https://example.com">Link</a>;  // no rel for external + new-tab safety
}
```

## Good

```tsx
function Avatar({ src, name }: { src: string; name: string }) {
  return <img src={src} alt={`${name}'s avatar`} />;
}

function Card({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}>
      Click me
    </button>
  );
}

function ExternalLink() {
  return (
    <a href="https://example.com" target="_blank" rel="noopener noreferrer">
      Link
    </a>
  );
}
```

## Why no auto-fix?

A11y fixes require human judgment. An auto-fix for missing `alt` text would invent text that may be wrong; an auto-fix for an `onClick` on a `<div>` could rewrite the element but lose surrounding intent.

Narrow, safe codemods may land in a future version (e.g., adding `lang="en"` to `<html>`), but only for changes that cannot semantically harm the page.

## Allowlist

```tsx
{/* lyse-disable-next-line a11y/essentials */}
<div onClick={openModal}>Legacy entry point</div>
```

Use sparingly. A11y allowlists should be a documented compromise, not a default.

## What does NOT trigger this rule

- Test files (`*.test.*`, `*.spec.*`).
- Storybook story files (`*.stories.*`).
- MDX prose (`.md`, `.mdx`).

## Full TSX support

The ESLint flat config uses [`@typescript-eslint/parser`](https://typescript-eslint.io/packages/parser/)
for `.ts`/`.tsx` files and the default `espree` parser for `.js`/`.jsx`.
TypeScript-specific syntax (interfaces, generics, type annotations, `as` casts)
is parsed end-to-end, so a11y rules fire on real React+TS codebases — not just
on idealized JSX snippets. The parseErrors surface stays in place for any
parser limitation (CSS modules, MDX, etc.).

Residual skip channels still exist for completeness:

- `meta.coverage.parseErrors[]` in the JSON report contains `{ file, reason }`
  entries for every file the rule could not parse (sorted by `file`). With the
  TS parser wired in, this list is near-empty in practice — only files with
  real syntax errors remain.
- The `opportunities` denominator for the a11y axis **excludes** these files,
  so the score reflects only what was actually analyzed.
- Files that the upstream SWC parser already failed on (surfaced by the
  pipeline as a `[lyse] Warning: skipped N file(s) due to parse errors` line
  on stderr) are skipped by the rule — they are NOT re-reported under
  `coverage.parseErrors`, to avoid double-counting.

## Configuration

```yaml
# .lyse.yaml
rules:
  a11y/essentials:
    severity: error
    disable:
      - "no-redundant-roles"   # opt out of a specific sub-rule
```

## See also

- [`eslint-plugin-jsx-a11y`](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y) — the underlying rules wrapped here.
- [W3C WAI Easy Checks](https://www.w3.org/WAI/test-evaluate/preliminary/).
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
