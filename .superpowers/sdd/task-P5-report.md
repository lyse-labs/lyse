# Task P5 Report — components/naming/stories addressable adapters

**Date:** 2026-06-22
**Branch:** worktree-agent-afe27fa689430bfe6 (rebased onto feat/autonomous-validation-engine)

## Rules covered (8 of 8 targets)

All rules from `ADDRESSABLE_PENDING` in the components, naming, and stories axes achieved J=1.000 with fn=0 and fp=0.

| Rule | Oracle kind | Mutations | Key insight |
|------|-------------|-----------|-------------|
| `components/svg-viewbox` | construction | 2 | Simple regex scan on `.tsx`; inject `<svg width="24">` without `viewBox` |
| `components/icon-decorative-aria` | construction | 2 | AST JSX walk; inject `<svg>` with no aria-hidden/role/aria-label |
| `components/no-icon-fonts` | construction | 3 | Repo-level check; inject via package.json dep, CSS @font-face, or class name |
| `components/no-native-shadows` | construction | 2 | Needs `componentsModule`; auto-detected from `@acme/ui` in package.json deps |
| `components/doc-comments` | construction | 2 | Needs public exports; inject via `package.json "main"` + index.tsx re-export |
| `naming/component-pascalcase` | construction | 2 | Inject exported function returning JSX with camelCase or snake_case name |
| `naming/hook-prefix` | construction | 2 | Inject exported function calling `useState`/`useContext` without `use` prefix |
| `stories/coverage` | construction | 1 | Required TWO components+stories (clean) then drop one story — keeps storyIndex non-null |

## Dropped as gaps

None. All 8 targeted rules are covered.

## Non-trivial adapter challenges

### `stories/coverage` — the null-storyIndex trap

The rule returns `{ findings: [], opportunities: 0 }` (N/A) when `storyIndex` is null, which happens when there are zero story files in the fixture. A naive "remove the story file" mutation would drop storyIndex to null and produce 0 findings — not a true violation catch.

Fix: the fixture uses TWO components (Button + Card) with stories for both (clean). The mutation removes only Button's story while keeping Card's — storyIndex stays non-null (via Card.stories.tsx), componentInventory still contains Button, and the rule correctly flags it.

### `components/doc-comments` — public-exports resolver

The rule scans only components that are part of the package's PUBLIC API (re-exported from the package entry). The `resolvePublicExports` loader reads `package.json`'s `main`/`exports` field to find the entry file, then parses it for re-exported PascalCase names.

Fixture: `package.json` with `"main": "src/index.tsx"` + `src/index.tsx` re-exporting `Button` + `src/Button.tsx`. Clean = JSDoc present; mutations = no JSDoc on function or arrow form.

### `components/no-native-shadows` — componentsModule auto-detection

The rule requires `ctx.componentsModule` to be set and a file that imports from it. The pipeline auto-detects via `detectFromPackageJson` — branch 1 matches any dep matching `/^@[^/]+\/(ui|components|design)/`. Using `@acme/ui` in `package.json.dependencies` triggers auto-detection cleanly.

## Runner summary

All 36 adapters pass at J=1.000. No regressions on pre-existing rules.

```
components/doc-comments      J=1.000  clean
components/icon-decorative-aria  J=1.000  clean
components/no-icon-fonts     J=1.000  clean
components/no-native-shadows  J=1.000  clean
components/svg-viewbox       J=1.000  clean
naming/component-pascalcase  J=1.000  clean
naming/hook-prefix           J=1.000  clean
stories/coverage             J=1.000  clean
```

## Files changed

- `packages/core/validation/adapters/component-adapters.ts` — new file (8 adapters)
- `packages/core/validation/adapters/index.ts` — import + spread `componentAdapters`
- `packages/core/validation/coverage.ts` — removed 8 rules from `ADDRESSABLE_PENDING`
- `packages/core/validation/report.json` — regenerated (36 rules, all J=1.000)
- `packages/core/tests/validation/component-adapters.test.ts` — new e2e tests (4 tests)
- `.superpowers/sdd/task-P5-report.md` — this file

## Self-review

- All adapters use real registered ruleIds (verified against `registry.ts`)
- No LLM calls anywhere — pure construction/execution oracle
- TypeScript compiles clean; no implicit any
- `pnpm build` passes
- `vitest run` 4/4 tests pass
- Full runner: 36/36 rules at J=1.000

## Concerns

None. The 8 rules are straightforward construction oracles. The `stories/coverage` adapter required one non-obvious fix (two-component fixture) but is now correctly capturing the violation.
