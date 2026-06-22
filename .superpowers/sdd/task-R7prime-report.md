# Task R7′ Report — Pipeline builds + passes DTCG canonical map (drops renderedSourceCss)

## How DTCG JSON was obtained

The `loadTokens` loader does NOT expose raw DTCG JSON — it only returns a processed `TokenMap`. Therefore, the pipeline re-discovers DTCG files itself using `fast-glob(["**/*.tokens.json"], { ignore: ["**/node_modules/**"] })` against `absoluteRoot`, then re-reads + JSON.parses the first valid file. This is the same glob pattern used by `fromDtcg` in `loaders/tokens.ts`, ensuring consistent file discovery.

## N/A-when-no-DTCG path

If `fg(["**/*.tokens.json"])` returns an empty array, or all discovered files fail `JSON.parse`, the pipeline sets:

```ts
renderMeta = { chromiumVersion: "n/a", skippedNonCanonicalizable: 0, error: "no DTCG token source" };
```

No browser is launched. The rule `tokens/rendered-token-fidelity` returns `{ findings: [], opportunities: 0 }` because `ctx.canonicalTokens` is absent.

## Degrade path

On `RenderUnavailableError` (Playwright/Chromium not installed) or any other error during render:

```ts
renderMeta = { chromiumVersion: "n/a", skippedNonCanonicalizable: 0, error: e.message | String(e) };
```

`ctx.rendered` and `ctx.canonicalTokens` remain unset. Pipeline continues. Score unaffected.

## renderedSourceCss removal

- `RuleContext.renderedSourceCss?: string` removed from `packages/core/src/types.ts`
- `ctx.renderedSourceCss = tokenCss` assignment removed from `packages/core/src/commands/audit-pipeline.ts`
- Zero remaining references in `src/` (verified with grep)

## TDD RED/GREEN

### RED (before changes)
The test file had no `no DTCG source` case. The pipeline set `ctx.renderedSourceCss` which TypeScript still accepted. The build succeeded before changes but the semantic was wrong (renderedSourceCss was the old design before R5b/R6').

### GREEN (after changes)

```
pnpm exec vitest run tests/commands/audit-render.test.ts
 Test Files  1 passed (1)
      Tests  3 passed (3)
   Duration  3.29s

pnpm exec vitest run tests/render tests/rules/tokens-rendered-token-fidelity.test.ts
 Test Files  7 passed (7)
      Tests  37 passed (37)
   Duration  805ms
```

## Files changed

| File | Change |
|------|--------|
| `packages/core/src/types.ts` | Removed `renderedSourceCss?: string` from `RuleContext` |
| `packages/core/src/commands/audit-pipeline.ts` | Added `fast-glob` + `buildDtcgCanonicalMap` imports; rewired render stage to: detect DTCG files → N/A if none → build canonical map → render → set `ctx.canonicalTokens`; removed `ctx.renderedSourceCss` assignment |
| `packages/core/tests/commands/audit-render.test.ts` | Added `no DTCG source → N/A` test case; updated `DTCG + CSS drift` test to include a `.tokens.json` fixture; kept `default audit unaffected` test unchanged |

## Self-review

- The re-glob in the pipeline is a minor duplication with `loaders/tokens.ts::fromDtcg`, but it's minimal (3 lines) and avoids coupling the loader to the pipeline. YAGNI.
- Only the first valid DTCG file is used for the canonical map. This is correct for single-token-file repos; for multi-file repos a merge could be added in v0.2 when `buildDtcgCanonicalMap` is extended.
- `ctx.canonicalTokens` is only set when `ctx.rendered` is also set (browser succeeded). The rule guards `if (!ctx.canonicalTokens) return N/A`, so the two always appear together or not at all.

## Concerns

- None blocking. The one structural note: if a repo has multiple `.tokens.json` files (uncommon in v0.1 target), only the first parseable one is used. This is deterministic (fast-glob sort order) and consistent with current `fromDtcg` behavior which processes all files but the canonical map only uses one seed. Low-priority v0.2 enhancement.
