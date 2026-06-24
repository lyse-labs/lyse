---
"@lyse-labs/lyse": patch
---

Trim the published dependency closure: remove the unused `openai` runtime dependency (the openai-compatible LLM path uses `fetch`, never the SDK — it was shipped to every consumer for nothing) and move `@eslint/js` from `dependencies` to `devDependencies` (a lint-time tool that was leaking into the runtime install). No behavior change; `eslint` and `eslint-plugin-jsx-a11y` stay runtime deps because the `a11y/essentials` rule runs them programmatically.
