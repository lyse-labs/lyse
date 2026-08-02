---
"@lyse-labs/lyse": patch
---

`--format=eslint` told users that the findings driving their score did not count.

Under a score of 59, vibe's footer read "1 stable findings · 107 experimental (not counted)". 76 of those 108 findings are what produced the 59.

The line partitioned on `Finding.confidence` — a codemod-safety classification ("is there a safe automatic fix?") assigned after the score is computed, and read by neither scorer. The same field drove the per-line `EXP` tag, so score-driving errors were displayed as experimental.

Both now use the scorer's own partition: the rule must be score-contributing and unblocked, and its axis must have escaped the min-N floor. vibe reads `76 findings counted in score · 32 not counted`, matching its axes. A new generalization invariant (H4) pins the per-finding count and the per-axis sum against each other on every pinned repo.

Closes #277.
