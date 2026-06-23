# Runtime a11y via Storybook + axe-core — design

> **Status:** design / spec (approved in brainstorming 2026-06-23). Next: implementation plan.
> Builds on the opt-in render layer (`packages/core/src/render/`) introduced for rendered-token-fidelity
> (currently in PR #188). This branch is stacked on that work; rebase after #188 merges.

## Goal

Run `axe-core` accessibility checks against a design system's **real rendered components**, sourced
from an **already-built Storybook**, under the opt-in `lyse audit --render`. Surfaces runtime a11y
violations (including color contrast — an axe rule) that static analysis cannot see. Default
`lyse audit` is unchanged.

## Key scoping decision (de-risks the fragile substrate)

Lyse **consumes a pre-built Storybook** (`storybook-static/` directory or a running Storybook URL) —
it does **NOT** run the repo's build toolchain. This sidesteps the worst fragility (each repo's build
is different/flaky) and keeps Lyse from owning the user's build. N/A when no Storybook is provided/found.

## Components

### `render/storybook-source.ts`
```
resolveStorybook(repoRoot: string, opts: { dir?: string; url?: string }): StorybookSource | null
listStories(source: StorybookSource): Promise<StoryRef[]>   // StoryRef = { id: string; title: string; url: string }
```
Locates a static Storybook (`storybook-static/index.json`/`stories.json`) or resolves a running URL;
enumerates story ids → per-story iframe URLs (`iframe.html?id=<id>`). Returns `null` when none found.

### `render/axe-runner.ts`
```
runAxeOnStory(page: Page, storyUrl: string): Promise<AxeViolation[]>
// AxeViolation = { ruleId: string; impact: string; nodes: number; help: string }
```
Navigates the page to the story iframe URL, injects the pinned `axe-core` (a new dependency), runs
`axe.run()`, returns the violations. Uses the existing `withChromium` harness.

### `rules/a11y-runtime-axe.ts`
Rule `a11y/runtime-axe` (axis `a11y`). Consumes axe violations collected per story (threaded via
`RuleContext.axeViolations?`), emits one Lyse finding per violation (severity from axe impact:
critical/serious → error, moderate/minor → warning). N/A (`opportunities: 0`) when no axe data.

## Data flow

```
lyse audit --render [--storybook <dir|url>]
  → resolveStorybook → null? meta.render.error = "no Storybook" (N/A), skip browser
  → listStories → withChromium(page): for each story, runAxeOnStory → AxeViolation[]
  → attach ctx.axeViolations → a11y/runtime-axe emits findings → AuditResult (truth-grade MEASURED)
  → meta.render = { chromiumVersion, axeVersion, storiesProbed, error? }
```

## Determinism

`axe-core` is pinned and deterministic given a DOM. The Storybook artifact is the user's (Lyse reads
it, does not generate it). Story order sorted by id. No timestamps in output. The only residual
non-determinism (browser rendering) is bounded by the provided DOM.

## Error handling

- No Storybook found/provided → N/A (meta.render.error = "no Storybook"), no browser launch.
- Playwright/Chromium absent → clean skip (RenderUnavailableError), as in the existing render layer.
- A single story failing to render → recorded, skipped, others continue (degrade, no crash).

## Engine validation (execution oracle)

A new execution-oracle adapter validates the **render→axe→finding path** WITHOUT a full Storybook
build: render a minimal HTML "story" with a KNOWN axe violation (e.g. `<img>` with no `alt`) → axe
flags it → rule emits a finding (TP); a clean HTML (`<img alt="x">`) → no violation → not flagged (TN).
Youden's J = 1 on this construction set (same faithful-oracle discipline as the rendered-token-fidelity
keystone). `axe-core` itself is the trusted upstream; the adapter validates Lyse's wiring, not axe.

## Integration (lessons applied)

- Register `a11y/runtime-axe` in `rules/registry.ts` **AND add a matching `SUB_AXES` catalogue entry**
  (experimental, `contributesToScore: false` — opt-in/render-only, N/A in default audit) so the
  registry↔catalogue parity test stays green (the gap that bit rendered-token-fidelity).
- Classify the rule as execution-covered in `validation/coverage.ts` (completeness gate stays green).
- `axe-core` added as a dependency (it ships as the rule's engine; not optional like Playwright since
  it's small and pure-JS — but it only runs in render mode).

## Non-goals (YAGNI)

- Building the repo's Storybook (consume a pre-built artifact only).
- Visual regression / screenshots.
- axe rules beyond its default ruleset; custom WCAG interpretation.
- Mapping every axe rule to a bespoke Lyse rule (one `a11y/runtime-axe` rule carries all axe findings).

## Truth-grade & honesty

Findings are **MEASURED** (execution oracle). Limits stated wherever shown: Storybook-only; consumes a
pre-built artifact; covers only axe-core's automatable subset (~30% of WCAG criteria); N/A without
Storybook. No over-claim — a build/render failure yields N/A, never a false pass.
