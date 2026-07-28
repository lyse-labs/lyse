---
"@lyse-labs/lyse": patch
---

Add an OKLCH-aware external-package JS token-snapshot resolver to the git-mined recall harness (measurement-layer only, `recallSource: "git-mined"`, non-gating per ADR 0022 §8). No score change; `lyse audit` is unaffected. Git-mined N is unchanged at 3 — the resolver correctly resolves canvas-kit's `base.*` refs to their exact values, but the sampled JS corpus contains no genuine value-preserving migration (canvas-kit's tokens are comment-documented authorship, not migrated hardcoded values), so all its candidates correctly fail closed.
