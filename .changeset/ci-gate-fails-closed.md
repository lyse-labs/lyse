---
"@lyse-labs/lyse": patch
---

CI gate integrity: `lyse audit` no longer passes on a missing path, a typo'd flag, an unscoreable run, or a deleted design system.

Four ways the gate failed open, each reproduced end-to-end:

- `audit /path/that/does/not/exist` exited 0 and reported nine findings about the absent directory. Now exit 64.
- Undeclared flags were accepted silently: `--treshold=99` exited 0 where `--threshold=99` exits 1. Unknown options on `audit` now exit 64; kebab/camel aliases and `--no-*` negations still work.
- `--threshold` passed whenever the score was `N/A`, so losing detection flipped a gate green. A threshold gate now fails closed on an unscoreable run.
- `baseline write` → `rm -rf src/components` → `audit --scope new` reported 0 new findings and exit 0. The graph hash covered only tokens, so deleting every component left it unchanged; it now covers component identity, and a stale baseline fails the gate rather than printing a warning beside a green build.
