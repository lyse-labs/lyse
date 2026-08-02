---
"@lyse-labs/lyse": patch
---

Token definitions written as a JavaScript or TypeScript object are now extracted — how Chakra, Carbon and Mantine define their themes.

A file must hold at least 8 token-shaped entries before it is believed. Without that gate a styled component with one `color: '#fff'` becomes a token definition, and every component inflates the denominator the tokens axis divides by.

Measured on the pinned corpus: chakra `0 → 13` token nodes (extraction `degraded → ok`), daisyui `38 → 87` and six fewer `tokens/no-hardcoded-spacing` findings, mantine `299 → 306`, polaris `78 → 79`, shadcn `214 → 222`. Eight repositories unchanged; no finding count rose anywhere.

This does **not** fix the abstaining tokens axis: chakra still scores N/A with one opportunity, so the axis is not starved of tokens.

Also fixes the ecosystem diff, which compared extractor status but not evidence numbers, and per-rule counts but not finding identity — it called polaris and shadcn "unchanged" while their golden snapshots recorded a change. On this very change the report went from 2 of 13 repositories moved to 5 of 13.
