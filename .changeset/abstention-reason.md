---
"@lyse-labs/lyse": patch
---

An abstaining axis now says why.

`tokens N/A n=1` is true and useless — it does not distinguish "nothing to measure" from "could not read it" from "the checks that count never ran", and those need three different responses. `AxisScore.abstentionReason` carries a sentence, and the degraded extractor is named only on the axes whose rules it actually blocked.

Surfaced while investigating #264: the tokens axis abstains on every design system in the corpus because its only volume-producing scored rules read DTCG `*.tokens.json` files, and essentially no shipped design system publishes one. No user could infer that from `N/A`.
