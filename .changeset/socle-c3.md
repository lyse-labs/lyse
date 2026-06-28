---
"@lyse-labs/lyse": minor
---

Two new experimental socle rules (C3 sub-project) — `stories/props-documented` and `stories/usage-examples`.

Both judge the content of a Storybook story a DS component already has (absence of a story stays `stories/coverage`'s job). `stories/props-documented` flags a story that documents no props — neither an `argTypes` block nor any named story carrying `args`. `stories/usage-examples` flags a story showing no usage examples — fewer than two named exports and no arg'd export. Both `experimental` / `contributesToScore: false` — no Health Score change; ship unmeasured (real-world precision pending a harvest measurement). The story loader now records `hasArgTypes` per story entry.
