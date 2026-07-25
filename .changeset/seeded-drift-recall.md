---
"@lyse-labs/lyse": patch
---

New `measure:recall` seeded-drift harness measures per-`(rule, class)` recall on committed
fixtures as a CI regression net + candidate estimate (`recallSource: "seeded"`) — never
gate-eligible, no score change.
