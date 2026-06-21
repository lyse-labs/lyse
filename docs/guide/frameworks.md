# Framework coverage

Lyse audits any framework's **styles and tokens**; component- and a11y-level
rules that parse component markup are currently React/Vue-oriented. This page is
the honest matrix of what runs where.

## How routing works

The audit walks `.ts/.tsx/.js/.jsx`, `.css/.scss`, and single-file components
`.vue` / `.svelte`. For an SFC, Lyse extracts the `<style>` block (→ CSS rules)
and the `<script>` block (→ TypeScript/JS rules), preserving source line numbers.

## Coverage matrix

| Capability | React / Solid (`.tsx`) | Vue (`.vue`) | Svelte (`.svelte`) | Angular | Web components |
|---|---|---|---|---|---|
| **Token rules** (hardcoded color / spacing / radius / shadow / motion / z-index / typography / gradient, media queries, DTCG, custom-property export) | ✅ | ✅ | ✅ | ⚠️ CSS only | ⚠️ CSS only |
| **CSS-in-JS** token rules | ✅ | ✅ (`<script>`) | ✅ (`<script>`) | ⚠️ | ⚠️ |
| **AI-governance / AI-surface / versioning / docs** (file- & config-level) | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Component & a11y rules that parse markup** (`components/doc-comments`, `components/contracts-strictness`, `components/icon-decorative-aria`, `naming/component-pascalcase`, `naming/hook-prefix`, `a11y/semantic-html`) | ✅ | ✅ (JSX-shaped `<script>`) | ❌ markup not parsed | ❌ | ❌ |

✅ full · ⚠️ partial (only what's expressed as CSS/config) · ❌ not yet

## Svelte (verified)

A Svelte design system audits today for **tokens, CSS, AI-governance, and
config** — the 45 framework-agnostic rules. The `<style>` and `<script lang="ts">`
blocks of every `.svelte` file are extracted and scanned with correct line
numbers (see `fixtures/svelte-ds` + `tests/frameworks/svelte-coverage.test.ts`).

**Gap:** the six rules that parse component *markup* via a JSX AST do not see
Svelte markup (`on:click`, `{#if}`, slots). Reaching React-parity for those needs
a Svelte AST parser (`svelte/compiler`) and Svelte-aware rule logic — tracked on
[lyse-labs/lyse-internal#102]. Until then, Svelte coverage is the token / CSS /
governance surface, which is the bulk of design-system drift.

## Angular / web components

Not yet supported beyond any CSS Lyse happens to scan. Angular keeps templates in
separate `.html` files with a proprietary template language and decorator-based
components; web components add Shadow DOM and library-specific definitions
(Lit/Stencil/…). Both are larger, separate efforts tracked on #102 — they are not
partially-shipped, to avoid a misleading "we support Angular" with systematic
blind spots.
