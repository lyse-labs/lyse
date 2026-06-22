# Rendered Token Fidelity — design

> **Status:** design / spec (approved in brainstorming 2026-06-22). Next: implementation plan.
> Companion to `docs/architecture/coverage-universe.md` (Axis J — visual/rendered-value drift) and
> `docs/architecture/autonomous-engine.md` (the mutation+oracle validation engine).

## Goal

Detect **cascade/override drift on the token layer**: a CSS custom property (`--token`) whose
**rendered computed value** differs from its **source definition** — caused by cascade, specificity,
`!important`, or a leaked override. This is real drift that static analysis **cannot** see (the code
references the token correctly; the rendered result lies). MVP is scoped to the token layer only — no
component rendering, no visual regression, no contrast.

## The job (what it catches)

1. **Override drift:** a `--token` whose computed value ≠ its source definition (an override silently
   changed it).
2. **Theme leak:** a mode selector (`.dark` / `[data-theme=…]`) that fails to change a token it is
   supposed to override (or changes one it should not).
3. **Unresolved reference:** a `var(--token)` that resolves to nothing.

## Non-goals (YAGNI — explicit)

- Rendering real components / Storybook (needs the repo's build — fragile, non-deterministic).
- Visual regression / screenshot diffing.
- Computed contrast / WCAG (separate scope, Axis C7).
- Non-sRGB color spaces (oklch/lab/p3) and percentage lengths: **honestly skipped** (not
  canonicalizable to a stable comparison), recorded — never silently passed.

## Architecture

An **opt-in render layer** in `packages/core/src/render/`, mirroring the existing opt-in LLM layer.

- Default `lyse audit` is **unchanged**: zero-config, offline, no browser.
- Activation: `lyse audit --render` (flag wired in the audit CLI, parallel to the LLM flags).
- **Playwright is an optional peerDependency.** If Playwright/Chromium is absent, the render layer
  **skips cleanly** with an actionable install message; the audit completes without render findings
  (degrade path identical to the LLM layer's `RefuseToRunError`/degrade behavior).
- **Chromium version is pinned** and recorded in the audit `meta` (determinism + reproducibility).

## Components

Each unit has one responsibility and a well-defined interface.

### `render/browser.ts`
```
withChromium<T>(fn: (page: Page) => Promise<T>): Promise<T>
```
Launches the pinned Chromium via Playwright, provides a `Page`, guarantees teardown (try/finally).
Throws a typed `RenderUnavailableError` if Playwright/Chromium is not installed (caught by the caller
→ clean skip). No network: pages are populated via `page.setContent`.

### `render/token-probe.ts`
```
probeComputedTokens(css: string, tokenNames: string[], modeSelectors: string[], page: Page)
  : Promise<ComputedTokenReading[]>
// ComputedTokenReading = { token: string; mode: string | "root"; computed: string }
```
Builds a minimal HTML document embedding `css`, with a probe element under `:root` and one under each
`modeSelector`. For each `--token`, reads `getComputedStyle(el).getPropertyValue(token)` (the resolved
computed value). Returns one reading per (token, mode).

### `render/canonicalize.ts`
```
canonicalize(value: string): { kind: "color" | "length" | "skip"; canonical: string }
```
Pure, no browser. sRGB color inputs → `rgb()/rgba()`; lengths → `px` where resolvable. oklch/lab/p3,
percentages, and anything else → `{ kind: "skip" }` (recorded as a skipped, not-canonicalizable value).
Deterministic.

### `rules/tokens-rendered-token-fidelity.ts`
The rule (axis `tokens`, id `tokens/rendered-token-fidelity`). Consumes the computed readings + the
existing token source map (from the token loaders / DTCG). For each (token, mode):
- canonicalize both the computed value and the source-defined value (for that mode);
- if both are canonicalizable and differ → **override-drift** finding;
- if a mode selector defines a token in source but the computed value under that mode equals the
  `:root` value (no change) → **theme-leak** finding;
- if computed is empty / unresolved → **unresolved-reference** finding;
- if either side is `skip` (non-canonicalizable) → no finding, increment a recorded `skipped` counter
  (surfaced in meta, honest).

**Outside render mode** (no `--render`), the rule returns `{ findings: [], opportunities: 0 }` (N/A) —
it never affects the default-audit score.

## Data flow

```
lyse audit --render
  → token loaders (existing) produce: token CSS + source token map + detected mode selectors
  → withChromium(page):
        probeComputedTokens(css, tokenNames, modeSelectors, page) → ComputedTokenReading[]
  → tokens/rendered-token-fidelity compares readings vs source (via canonicalize)
  → findings merged into the AuditResult, truth-grade = MEASURED (execution oracle)
  → meta.render = { chromiumVersion, skippedNonCanonicalizable, error? }
```

## Determinism

- Pinned Chromium version (recorded in `meta.render.chromiumVersion`).
- Offline: `setContent` only, no network fetch during render.
- Same CSS + same pinned browser → identical computed values.
- Canonicalization is pure/deterministic; non-canonicalizable values are skipped deterministically and
  counted (never silently dropped).

## Engine integration (validation)

A new **execution-oracle** adapter in `packages/core/validation/` validates the rule via the same
mutation+oracle engine — the browser is the oracle:

- **Mutation (TP):** a fixture that injects an override drift, e.g.
  `:root { --c: #fff } .leak { --c: #000 }` applied to the probed element that should keep `--c=#fff`
  → render → rule flags. (Also a theme-leak mutation: a `.dark` block that fails to override a token.)
- **Clean (TN):** the same fixture without the override → render → not flagged.
- Youden's J on the confusion matrix; metamorphic pairs for equivalent override spellings.
- This is a new `oracleKind: "execution"` adapter; the engine's `evaluateAdapter` runs it through the
  render layer (browser) instead of the static `auditDirectory` probe. The adapter is gated on
  Playwright availability (skips in CI lanes without Chromium, runs in the dedicated render lane).
- The new rule must be registered in `rules/registry.ts` and therefore classified by the completeness
  gate — it lands in **covered** via this adapter.

## Error handling

- Playwright/Chromium absent → `RenderUnavailableError` → CLI prints an actionable install hint, audit
  continues without render findings (no crash, no failure exit).
- Render failure mid-run (CSS parse error, browser crash) → recorded as `meta.render.error`, audit
  continues with static findings (degrade, like the LLM layer).

## Testing

- **Unit (no browser):** `canonicalize` — sRGB/length canonicalization + skip cases.
- **Render lane (Chromium):** `token-probe` + the rule against fixtures — computed-value reading,
  override-drift detection, theme-leak detection, unresolved-reference; skipped if Playwright absent.
- **Engine:** the execution-oracle adapter — recall (injected drift caught) + precision (clean not
  flagged), Youden's J = 1.0 on the construction set.

## Truth-grade & honesty

Findings are **MEASURED** (execution oracle), eligible for the validated score. Limits stated wherever
output appears: token layer only; sRGB + px/rem only (oklch/lab/% skipped and counted); modes limited
to those Lyse detects; opt-in (default audit unaffected). No over-claim — non-canonicalizable values
are reported as skipped, not as passing.
