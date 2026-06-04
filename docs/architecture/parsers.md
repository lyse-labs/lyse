# Parsers

How Lyse extracts ASTs from source files.

## Three parsers, one interface

Lyse uses three parsers, each optimized for a content type:

| Parser | Files | Why this parser |
|---|---|---|
| **SWC** | `.ts`, `.tsx`, `.js`, `.jsx` | Fast (10-20x faster than Babel), mature TS support, deterministic AST. |
| **PostCSS** | `.css`, `.scss`, `.module.css` | The standard for CSS tooling. Plugin ecosystem available for later extension. |
| **Babel** | styled-components / Emotion template literals inside `.ts` / `.tsx` | SWC doesn't expand template literal contents; Babel does, with the right plugins. |

The three parsers produce different AST shapes. Rules consume the unified `ParsedFiles` type:

```ts
interface ParsedFiles {
  ts: Map<string, SwcModule>;
  css: Map<string, PostCSSRoot>;
  cssInJs: Map<string, BabelFile>;
}
```

Rules decide which subset of `ParsedFiles` they care about and visit those.

## Why SWC for TS/JS (not Babel)

The classic JS parsing choice is Babel. Lyse uses SWC because:

1. **Speed.** SWC is written in Rust. On a 5,000-file repo, SWC parses in ~3 seconds; Babel takes ~30+ seconds.
2. **TS-native.** SWC understands TypeScript directly, no `@babel/preset-typescript` chain.
3. **Determinism.** SWC's parser is more deterministic than Babel's plugin-driven approach.
4. **Smaller dependency tree.** SWC is one package. Babel is a constellation.

The cost: SWC's AST shape is less well-documented than Babel's. A thin internal helper layer (`src/parsers/ts.ts`) abstracts SWC quirks.

### Known SWC quirks documented in code

- `NamedImportSpecifier` nodes have `type: "ImportSpecifier"`, not `"NamedImportSpecifier"`. Documented inline in the parser file.
- SWC's span offsets are byte-based, not character-based. A separate offset map converts to line/column.

## Why PostCSS for CSS

PostCSS is the standard for CSS tooling. Lyse uses it for:

- Plain CSS files (`.css`).
- CSS Modules (`.module.css`).
- SCSS (`.scss`) — handled via `postcss-scss` plugin.

PostCSS produces a node tree where each declaration (`color: #ff0000;`) is a `Declaration` node with `prop` and `value` strings. Rules walk this tree directly.

## Why Babel for styled-components / Emotion

styled-components and Emotion express styles as JavaScript template literals:

```tsx
const Button = styled.button`
  background: #3B82F6;
  padding: 14px;
`;
```

SWC sees this as a tagged template expression but doesn't expand the template contents into a parsed CSS-like AST. Babel, with `@babel/plugin-syntax-typescript` and a custom traversal, can identify these template literals and pass their contents to PostCSS for analysis.

This is the only place Lyse uses Babel. The integration is contained to `src/parsers/css-in-js.ts`.

### Babel default export interop

Importing Babel's `traverse` function in an ESM context has historically been finicky. Lyse uses the pattern:

```ts
import _traverse from "@babel/traverse";
// @ts-expect-error - Babel's default export interop
const traverse: TraverseFn = (_traverse.default ?? _traverse) as TraverseFn;
```

This handles both ESM and CJS-imported Babel installations.

## Parser invocation

The parser layer is invoked once per audit, before any rules run:

```ts
// in src/walker.ts → src/rule-runner.ts
const parsed = await parseAll(filePaths, config);
```

`parseAll` dispatches files to their appropriate parser, collects results, and returns the unified `ParsedFiles`.

Files that fail to parse are logged and excluded — they do not abort the audit.

## File type detection

By extension, in order:

1. `.tsx` → SWC (treat as TS + JSX).
2. `.ts` → SWC (treat as TS).
3. `.jsx` → SWC (treat as JS + JSX).
4. `.js` → SWC.
5. `.css`, `.module.css` → PostCSS.
6. `.scss` → PostCSS with `postcss-scss`.
7. Anything else → ignored.

There is no shebang detection, no content sniffing. Extension is authoritative.

## Memory shape

`ParsedFiles` is held in memory for the entire audit run. For a 5,000-file repo, this is typically 50-150 MB. No OOM issues have surfaced in real-world testing yet, but very large monorepos (50k+ files) may need a streamed-pass audit instead.

## Adding support for a new file type

To add Vue / Svelte / Solid / Angular support:

1. Add a new parser file: `src/parsers/vue.ts`.
2. Extend `ParsedFiles` with the new map: `vue: Map<string, VueAst>;`.
3. Update `parseAll` to dispatch `.vue` files to the new parser.
4. Update relevant rules to visit Vue ASTs.
5. Add tests under `tests/parsers/vue.test.ts`.

The rule contract doesn't change — rules pick which file types they care about. A rule that only inspects React TSX continues to work; new rules can opt into Vue / Svelte.

## Performance numbers

On a Macbook Pro M2 with cold disk cache:

| File count | Files type | SWC | PostCSS | Babel CSS-in-JS | Total |
|---|---|---|---|---|---|
| 500 .tsx | React app | 0.3s | — | 0.2s | 0.5s |
| 2,000 .tsx | Mid-size monorepo | 1.2s | — | 0.8s | 2.0s |
| 5,000 .tsx | Large monorepo | 3.0s | — | 2.0s | 5.0s |
| 1,000 .css | Pure CSS project | — | 0.4s | — | 0.4s |
| 3,000 mixed | Realistic project | 1.8s | 0.5s | 0.7s | 3.0s |

These numbers are pre-rule-execution. Rules add roughly 30-50% on top.

## Determinism

All three parsers are deterministic given the same input:

- SWC: source bytes → AST. No timestamps, no random IDs.
- PostCSS: same.
- Babel: same.

Plugins that introduce non-determinism (e.g., automatic JSX runtime detection that depends on environment) are avoided.

## See also

- [`packages/core/src/parsers/`](https://github.com/lyse-labs/lyse/tree/main/packages/core/src/parsers) — implementation.
- [`overview.md`](./overview.md) — where parsers fit in the pipeline.
- [`rules-engine.md`](./rules-engine.md) — how rules consume parser output.
