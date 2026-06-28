---
"@lyse-labs/lyse": patch
---

`tokens/no-hardcoded-color` reliability is now honestly uncalibrated (null) in the catalogue. The previous synthetic precision of 0.44 from an underpowered corpus was misleading — real-world precision is ~65% across 8 OSS repos (1256 findings), rising to ~88.9% on medium-confidence findings; recall is ~100%. The rule stays experimental and does not contribute to the Health Score. The rule doc gains a Reliability section explaining the lexical ceiling (~85–88%) and why 90%-scored is not honestly reachable with the current detection strategy.
