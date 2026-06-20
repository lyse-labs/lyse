# `a11y/html-lang`

> **Axis:** A11y · **Severity:** warning · **Auto-fixable:** no · **Status:** scored (v1)

Checks that the document `<html>` root declares a `lang` attribute.

## Why

WCAG 3.1.1 (Language of Page) requires the document language to be programmatically determinable. The `lang` attribute on `<html>` is how screen readers pick the right voice and pronunciation, how browsers choose hyphenation and quotation marks, and how language-scoped CSS (`:lang()`) and per-locale typography apply. A missing `lang` silently degrades the experience for assistive-tech and international users.

## How

The check is **repo-level**. It scans for an opening `<html>` tag in:

- JSX/TSX framework roots — Next.js `app/layout.tsx`, Remix `root.tsx`, Gatsby `html.js`.
- Real `.html` / `.htm` files.

If an `<html>` root carries no `lang` (in any form: `lang="en"`, `lang={locale}`, `:lang`, `xml:lang`), the rule emits **one** warning. If every `<html>` has a language — or the repo ships no `<html>` root at all (a pure component library) — it emits nothing (the latter is N/A). The `dir` attribute (RTL) is not required and is not penalized.

## Bad

```tsx
export default function RootLayout({ children }) {
  return <html><body>{children}</body></html>;
}
```

## Good

```tsx
export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
```

## What does NOT trigger this rule

- Any `<html>` with a `lang` (static or dynamic).
- A component library that never renders an `<html>` root (N/A).

## Allowlist

```
lyse-disable a11y/html-lang
```

## Status

**Scored (v1):** contributes to the Health Score. Promoted 2026-06-20 after clearing both gates on the synthetic recall suite (recall LB 0.901, precision LB 0.912).

## See also

- [MDN: `lang`](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/lang)
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
