# @lyse-labs/lyse

## 0.2.0-alpha.3

### Minor Changes

- 14e502f: Cleaner `lyse audit` report: a concise score line (`● B  71/100   design system health`), tidy per-axis bars, and top findings — with scoring-version, delta, and token-registry jargon trimmed out.
- 0c3c2fe: New opt-in `lyse audit --render` layer: renders the token layer in headless Chromium (Playwright as an optional peer dependency; the default audit stays offline and browser-free) to detect drift static analysis cannot see. Ships the experimental rule `tokens/rendered-token-fidelity`, which flags a CSS custom property whose browser-computed value differs from its DTCG canonical token value (cascade / override / alias drift). N/A without `--render` or a DTCG token source, and does not affect the default Health Score. Backed by a new mutation + independent-oracle validation engine that proves each rule's recall and precision by construction (Youden's J), with a completeness gate ensuring every rule is oracle-covered or explicitly classified.
- cd15498: Add `a11y/runtime-axe`: runtime accessibility checks via axe-core against a pre-built Storybook (`storybook-static/` or a URL), under the opt-in `lyse audit --render`. Adds the `--render` and `--storybook` CLI flags. Experimental rule — does not contribute to the Health Score.
- a362453: `lyse audit` gains two output formats: `--format=tsv` (keyless tab-separated findings for grep/cut/scripts) and `--format=table` (a human-scannable findings table).
- bea92ca: Terminal UI: introduce a dogfooded design-token layer (color + glyphs) and a doctor-style default audit view — a status glyph per axis with the Health Score as the verdict. ESLint-style output remains available via `--format=eslint`.
- 025f4bf: Terminal UI: the `lyse init` wizard now uses an interactive @clack/prompts flow (intro/outro, grouped confirmations, task spinners). Non-interactive and CI runs are unchanged — prompts are bypassed and output stays plain text.
- ad7163c: Terminal UI: the interactive `lyse` menu and the post-audit action menu now render with @clack/prompts. Non-interactive/CI behavior is unchanged.

### Patch Changes

- eb3a4ca: Fix `lyse audit --render` axe-core injection: `axe-core` assigns `.source`/`.version` onto `module.exports` at runtime, which node's cjs-module-lexer cannot see, so the `import * as axe` namespace lost `.source` once the full rule graph was loaded first — leaving the runtime-axe pass unable to inject axe into the page. Now loaded via `createRequire`, which returns the real CommonJS export object regardless of import order.

  Also adds an execution-oracle render lane to the autonomous validation engine (`pnpm validate:render` + a CI job): drives `tokens/rendered-token-fidelity` and `a11y/runtime-axe` through real Chromium and gates on Youden's J = 1, so the execution oracle is genuinely enforced in CI instead of silently skipped when a browser is absent.
