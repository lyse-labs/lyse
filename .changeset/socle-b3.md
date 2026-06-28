---
"@lyse-labs/lyse": minor
---

New experimental socle rule (B3 sub-project) — `components/standardized-variant-props`.

Flags a component that encodes mutually-exclusive visual variants as two or more separate `boolean` props (the "boolean explosion" antipattern: `<Button primary danger>`) instead of a single `variant` string-literal union. Only a curated style-modifier vocabulary (`primary`, `secondary`, `danger`, `ghost`, `outline`, …) typed `boolean` counts — generic state booleans (`disabled`, `loading`, …) are never matched — and the rule fires only at two or more. Orthogonal to `components/contracts-strictness`. `experimental` / `contributesToScore: false` — no Health Score change; ships unmeasured (real-world precision pending a harvest measurement).
