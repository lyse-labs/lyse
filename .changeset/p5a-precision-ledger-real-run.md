---
"@lyse-labs/lyse": patch
---

Real class-aware precision measurement (P5a run). `packages/core/rules-precision.json` is now generated from a real corpus (lyse-bench tier1 web-apps at pinned SHAs: cal.com, documenso, plane, vercel/commerce) instead of the illustrative fixture, and each of the ten `tokens/no-hardcoded-*` docs gains an auto-generated per-class Reliability section.

Headline result: the deterministic `exact` bucket — the only gate-eligible class — does **not** clear the 0.90 promotion gate, and not for lack of data. `tokens/no-hardcoded-color` exact/app is N=84 (≥ the 35 minimum) at **50.0% precision** (Wilson lower bound 0.395): all 42 false positives are trivial `#fff`/`#000` literals that exactly match a white/black token. Exact is a drift class for colour only — the nine numeric/scale axes treat `exact` as on-scale = compliant and never emit an exact finding, so their exact bucket is empty by design. Real-world drift is overwhelmingly `near` (1031 spacing) and `novel` (290 colour), never exact.

Measurement only: no rule, scorer, sub-axis catalogue, coverage map, or Health Score behaviour changed; 66 rules; `validate:autonomous` still passes. Adds `measure:ledger` and `docs:reliability:rules` scripts.
