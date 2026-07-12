---
"@lyse-labs/lyse": patch
---

Fix `@lyse-overrides` frontmatter silently disabling the whole block (#226). The parser was all-or-nothing brittle: CRLF line endings, a blank comment continuation line (` *`) between entries, an entry on the same line as the tag, or a second `@lyse-overrides` block each caused EVERY entry to be ignored — which read as "only the first rule is applied" because `tokens/no-hardcoded-color` skips custom-property token definitions by design. All four shapes now parse; multiple blocks merge (`off` unions, later severity wins, `off` beats a severity override for the same rule). Decorative separator lines (` * ----`) between entries are tolerated, and a tag quoted in code or prose (a string literal, a doc sentence) can no longer activate overrides — only a comment-shaped tag line opens a block.
