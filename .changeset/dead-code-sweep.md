---
"@lyse-labs/lyse": patch
---

Remove dead exports, types, and barrel re-exports found in a verified dead-code sweep (no behavior change). Highlights: 14 unused `_internal` test-scaffolding objects in rule files, the unreferenced `RuleModule` re-export (and the now-unused `@typescript-eslint/utils` dependency), 7 speculative DTCG value types that were never wired into `DtcgToken<T>`, dead barrel re-exports in `identity/index.ts` / `entitlement/index.ts` / `report/fix-groups.ts` / `reliability/measure/finding-row.ts`, three unused `git-helpers.ts` functions (`ensureSafeBranch`, `revertCommit`, `runTests`), `isBuiltinExcludedPath` (superseded by an inline check), the retired `wrap-ai-token` codemod's last helper (`reservedTokenRefOffsets`), and ~45 redundant `export` keywords narrowed to module-private now that nothing outside the file used them. Also adds `knip.json` ignore globs for fixtures/snapshots/tests-fixtures/validation/skills paths to cut recurring false positives.
