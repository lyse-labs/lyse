# Svelte coverage — verify, fixture, document (#102 slice)

**Status: APPROVED 2026-06-21 (Noé). Next: writing-plans → TDD.**
Flow: /using-superpowers. Issue: lyse-labs/lyse-internal#102 (framework-breadth), Svelte slice.

## Problem

#102 wants Svelte/Angular/web-components parity with React/Vue. Full parity needs
a per-framework AST parser (weeks, FP-risky) — out of the quick-win bar. But
**Svelte is already ~88% covered with zero code**: `.svelte` is walked, the SFC
extractors (`extractSfcStyleCss`/`extractSfcScript`, built for Vue) split it into
CSS + TS, and the 45 framework-agnostic rules (tokens / CSS / AI-governance /
config) fire on it. This is **unverified and undocumented** — no Svelte fixture,
no test locking it, no coverage doc. A user with a Svelte DS doesn't know what
works.

**Empirically verified (2026-06-21):** auditing a `.svelte` with hardcoded values
in `<style>` fires `tokens/no-hardcoded-color` (#ff0044), `tokens/no-hardcoded-spacing`
(13px), `tokens/no-hardcoded-border-radius` (7px) — at the correct source lines.

## Decision (locked with Noé)

Ship the **clean, 100%-OP slice**: lock + document the existing Svelte coverage.
Do NOT build a Svelte AST parser (full parity deferred; Angular/web-components are
weeks/research-grade — explicitly out of scope here).

## Architecture

**No production-code change.** This slice is a committed fixture + a test that
locks behaviour + docs. The capability already exists; we're proving and
documenting it.

**1. Fixture — `packages/core/fixtures/svelte-ds/`:**
- `package.json` (`{ "name": "svelte-ds", "private": true, "dependencies": { "svelte": "^5.0.0" } }`).
- `src/Button.svelte` — a `<script lang="ts">` block + Svelte markup (`on:click`) +
  a `<style>` block with hardcoded color / spacing / radius (the agnostic-rule targets).

**2. Test — `packages/core/tests/frameworks/svelte-coverage.test.ts`:**
- `auditDirectory(svelte-ds, { staticOnly: true })` →
  - asserts findings exist on `Button.svelte` for `tokens/no-hardcoded-color`,
    `tokens/no-hardcoded-spacing`, `tokens/no-hardcoded-border-radius`;
  - asserts the color finding's line matches the `<style>` source line (line-accuracy
    proof — the SFC extractor is line-preserving);
  - asserts the audit is NOT flagged `notADesignSystem` (Svelte DS scores normally).
- This locks the agnostic-rule coverage on Svelte so a future change to the SFC
  routing can't silently regress it.

**3. Docs — `docs/guide/frameworks.md` (new):**
- A coverage matrix: React/Vue (full), **Svelte (SFC `<style>`+`<script>` →
  tokens/CSS/AI-gov/config rules ✓; component & a11y rules that parse JSX markup
  are blind on Svelte markup — gap, needs a Svelte AST parser)**, Angular /
  web-components (not yet — separate large efforts).
- Link from `docs/guide/getting-started.md` and the README's feature list if present.

## Honest limits (documented in frameworks.md)

- The 6 Babel-JSX component/a11y rules (`components/doc-comments`,
  `components/contracts-strictness`, `components/icon-decorative-aria`,
  `naming/component-pascalcase`, `naming/hook-prefix`, `a11y/semantic-html`) do NOT
  see Svelte markup (`on:click`, `{#if}`) — they need a Svelte AST parser. Coverage
  on Svelte = tokens + CSS + AI-governance + config (the 45 agnostic rules).
- Angular (separate `.html` templates, decorators, proprietary template language)
  and web-components (Shadow DOM, Lit/Stencil detection) are **not** in this slice —
  weeks/research-grade; tracked separately on #102.

## Testing

- The coverage test above (TDD: write it, watch it pass on the committed fixture —
  it locks current behaviour, so it passes immediately; the "failing first" step is
  asserting against a not-yet-created fixture).
- Full suite + smoke unchanged (no production code touched).

## Scope / YAGNI

- No Svelte/Angular/web-component parser.
- No recall-suite per-framework fixtures (the agnostic rules are already calibrated;
  framework is orthogonal to their precision/recall — adding Svelte recall fixtures
  would re-measure the same rules). Noted as not-needed.
- #102 stays OPEN for the parser investment (Svelte component rules + Angular +
  web-components), with this slice closing the "Svelte agnostic coverage verified +
  documented" portion.
