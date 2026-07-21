---
"@lyse-labs/lyse": minor
---

feat: token rules resolve values against the repo's own derived scales (exact / near / novel / unresolved) instead of a hardcoded default list; audit numbers change on real repos and scores are not comparable across this change. The colour-parser upgrade that ships with it also widens `a11y/contrast-tokens`, so repos using space-separated `rgb()`/`hsl()` or `oklch()`/`oklab()` may see new a11y findings.
