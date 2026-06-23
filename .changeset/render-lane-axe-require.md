---
"@lyse-labs/lyse": patch
---

Fix `lyse audit --render` axe-core injection: `axe-core` assigns `.source`/`.version` onto `module.exports` at runtime, which node's cjs-module-lexer cannot see, so the `import * as axe` namespace lost `.source` once the full rule graph was loaded first — leaving the runtime-axe pass unable to inject axe into the page. Now loaded via `createRequire`, which returns the real CommonJS export object regardless of import order.

Also adds an execution-oracle render lane to the autonomous validation engine (`pnpm validate:render` + a CI job): drives `tokens/rendered-token-fidelity` and `a11y/runtime-axe` through real Chromium and gates on Youden's J = 1, so the execution oracle is genuinely enforced in CI instead of silently skipped when a browser is absent.
