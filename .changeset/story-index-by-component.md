---
"@lyse-labs/lyse": patch
---

The Storybook index now finds the stories real design systems ship. It was keyed by the story title's last path segment, so `Components/RadioGroup/Features` and `Components/SubNav/Features` collided on "Features", and a file with no `title:` at all — CSF3 auto-titling, the modern default — was skipped outright. The glob also matched only `*.stories.*`, missing the singular `*.story.*`. Measured: Polaris 9 → 87 indexed (of 87 story files), Mantine 0 → 269, Primer keyed by component instead of by title category. Entries now merge when several files document the same component instead of the last one winning.
