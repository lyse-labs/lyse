---
"@lyse-labs/lyse": minor
---

New opt-in `lyse audit --render` layer: renders the token layer in headless Chromium (Playwright as an optional peer dependency; the default audit stays offline and browser-free) to detect drift static analysis cannot see. Ships the experimental rule `tokens/rendered-token-fidelity`, which flags a CSS custom property whose browser-computed value differs from its DTCG canonical token value (cascade / override / alias drift). N/A without `--render` or a DTCG token source, and does not affect the default Health Score. Backed by a new mutation + independent-oracle validation engine that proves each rule's recall and precision by construction (Youden's J), with a completeness gate ensuring every rule is oracle-covered or explicitly classified.
