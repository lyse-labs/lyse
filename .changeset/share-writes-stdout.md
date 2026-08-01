---
"@lyse-labs/lyse": patch
---

`lyse share` now writes its markdown to stdout when stdout is redirected. The summary only reached stdout in the clipboard-failure branch, so `lyse share > summary.md` produced an empty file and a CI run wrote zero bytes and exited 0. On a TTY the clipboard is still the payload and the terminal stays clean.
