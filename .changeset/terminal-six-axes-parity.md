---
"@lyse-labs/lyse": patch
---

The default terminal view now renders every scored axis. `ai-surface` and `ai-governance` contribute to the Health Score but were invisible in the default report (only tokens/a11y/components/stories rendered) — the view now matches the score's composition, in the scorer's canonical order. Display-only: no score changes. Also refreshed two "Next steps" tips: the tokens tip now points at `lyse handoff` (the deprecated `lyse agents-md` was still referenced), and a low `ai-surface` score suggests `lyse init --scaffold`.
