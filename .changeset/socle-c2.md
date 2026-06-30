---
"@lyse-labs/lyse": minor
---

New experimental socle rule (C2 sub-project) — `a11y/interactive-role-name`.

Flags interactive controls that lack an accessible name (an icon-only `<button>` with no text/`aria-label`, a custom control without a label) by wrapping `eslint-plugin-jsx-a11y`'s `jsx-a11y/control-has-associated-label` — the one accessible-name rule `a11y/essentials` omits — through the same in-process ESLint harness. Zero overlap with essentials (which covers images, links, form-input labels, and ARIA validity). `experimental` / `contributesToScore: false` — no Health Score change; ships unmeasured (real-world precision pending a harvest measurement).
