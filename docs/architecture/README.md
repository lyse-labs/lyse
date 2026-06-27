# Architecture

How Lyse fits together. For external contributors who want to understand or extend the codebase.

## High-level diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                              LYSE                                    │
│                                                                      │
│  ┌─────────────┐                       ┌──────────────┐             │
│  │     CLI     │                       │  MCP server  │             │
│  │ (lyse audit)│                       │  (lyse mcp)  │             │
│  └──────┬──────┘                       └──────┬───────┘             │
│         │                                     │                     │
│         └─────────────────┬───────────────────┘                     │
│                           │                                         │
│                           ▼                                         │
│                ┌─────────────────────┐                              │
│                │   Core engine       │                              │
│                │                     │                              │
│                │  walker             │                              │
│                │    │                │                              │
│                │    ▼                │                              │
│                │  parsers            │                              │
│                │    ├── TS / TSX     │                              │
│                │    ├── CSS / SCSS   │                              │
│                │    └── CSS-in-JS    │                              │
│                │    │                │                              │
│                │    ▼                │                              │
│                │  loaders            │                              │
│                │    ├── tokens       │                              │
│                │    ├── components   │                              │
│                │    └── stories      │                              │
│                │    │                │                              │
│                │    ▼                │                              │
│                │  rule runner ───────► rules                        │
│                │    │                │                              │
│                │    ▼                │                              │
│                │  scorer             │                              │
│                │    │                │                              │
│                │    ▼                │                              │
│                │  reporters          │                              │
│                │    ├── terminal     │                              │
│                │    ├── json         │                              │
│                │    └── sarif        │                              │
│                │                     │                              │
│                │  codemods           │                              │
│                │  entitlement (JWT)  │                              │
│                │  telemetry (opt-in) │                              │
│                └─────────┬───────────┘                              │
│                          │                                          │
│                          ▼ (opt-in only)                            │
│                ┌─────────────────────┐                              │
│                │ Worker (private)    │                              │
│                │ api.getlyse.com     │                              │
│                │  /v1/events         │                              │
│                │  /v1/bench/summary  │                              │
│                │  /v1/bucket-salt    │                              │
│                └─────────────────────┘                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Deep dives

| Topic | Doc |
|---|---|
| Engine overview, data flow | [`overview.md`](./overview.md) — high-level walkthrough |
| Parser strategy (SWC, PostCSS, Babel) | [`parsers.md`](./parsers.md) |
| Rules engine, rule contract | [`rules-engine.md`](./rules-engine.md) |
| Scorer (formula, renormalization) | [`scoring.md`](./scoring.md) |
| LLM judgement layer (Phase D design) | [`llm-judgement-layer.md`](./llm-judgement-layer.md) — semantic scoring, router → specialists → conformal abstention |
| MCP server design | [`mcp-server.md`](./mcp-server.md) |
| Gate B (real-FP validation) | [`gate-b-spec.md`](./gate-b-spec.md) — the z-score verdict that gates rule promotion |
| Governance traceability | [`governance-traceability.md`](./governance-traceability.md) — LLM grader rubric dimensions traced to Microsoft HAX / Google PAIR guidelines |
| Cloudflare Worker (private) | Receives opt-in telemetry events, serves the daily bucket salt, exposes public bench aggregates. See [`PRIVACY.md`](../../PRIVACY.md). |

## Top-level directories

| Path | Purpose |
|---|---|
| `packages/core/` | The `lyse` npm package. CLI, library, MCP server, codemods. |
| `docs/` | Public documentation (this directory). |
| `.github/` | CI workflows, issue templates, PR template. |

The benchmark corpus (70 public OSS repos) used to validate Health Score
reproducibility is hosted in a separate public repository
([`lyse-labs/lyse-bench`](https://github.com/lyse-labs/lyse-bench), CC BY 4.0).

The Cloudflare Worker (`api.getlyse.com`) and internal engineering
documents live in a separate private repository (`lyse-labs/lyse-internal`).
The CLI in this repo communicates with the Worker strictly over HTTPS.

## Design principles

1. **Local-first.** Compute happens on the user's machine. The Worker is optional infrastructure.
2. **Deterministic outputs.** Same input → same output. No randomness, no time-dependent values, no environment-dependent behavior.
3. **One responsibility per file.** Files stay small (< 300 lines preferred). When a file grows, split.
4. **Composable parsers.** SWC for TS/JS, PostCSS for CSS, Babel for styled-components / Emotion template literals. Each parser is isolated; rules don't care which parser produced the AST.
5. **Rules as data + behavior.** Each rule has a metadata declaration (`manifest.ts`) and a visitor function. Metadata is what users see; the function is the implementation.
6. **Output formats are pure functions of result + metadata.** No state shared between reporters; switching formats doesn't change the underlying audit.
7. **No magic.** Configuration is explicit; defaults are documented; behavior is traceable.

## Technology choices

- **TypeScript strict mode.** `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`.
- **SWC** — primary parser. Fast, mature, handles TS/JS/JSX.
- **PostCSS** — CSS parsing.
- **Babel** — fallback parser for styled-components template literals.
- **citty** — CLI framework. Lightweight, no jet-lag dependency tree.
- **`@modelcontextprotocol/sdk`** — MCP server.
- **vitest** — test runner. Fast, ESM-native.
- **`jose`** — JWT verification.
- **fast-glob** — file walking with `.gitignore` respect.
- **pnpm 9 workspaces** — monorepo management.
- **Cloudflare Workers + KV + D1** — Worker stack.

## Performance posture

- Cold install (`npx`): 3–8 seconds.
- Audit on a typical project (500–2000 files): 2–5 seconds.
- MCP `audit_file` per file: 50–200 ms.

Performance is measured per release. Regressions > 20% are blockers.

## Testing posture

- 600+ unit tests across `packages/core/`.
- 1 skipped subprocess test for MCP smoke (runs in CI only).
- Fixture-driven: real-world-shaped repos under `packages/core/fixtures/`.
- No mocking of parsers — SWC / PostCSS / Babel are real dependencies; mocking them breeds rot.

## How to extend Lyse

| Goal | Path |
|---|---|
| Add a rule | [Rules engine](./rules-engine.md) + [CONTRIBUTING.md](../../CONTRIBUTING.md) → "Rule contributions" |
| Support a new framework (Vue, Svelte) | [Parsers](./parsers.md) — add a new parser, then update relevant rules |
| Add an output format | [Reporters](./overview.md#reporters) — add `packages/core/src/reporters/<name>.ts` |
| Add an MCP tool | [MCP server](./mcp-server.md) → "Adding a tool" |
| Add a `.lyse.yaml` option | Update `schemas/v1/lyse-config.json`, then `packages/core/src/config/schema.ts` |

## See also

- [CHANGELOG.md](../../CHANGELOG.md) — what changed in each release.
- [CONTRIBUTING.md](../../CONTRIBUTING.md) — how to contribute.
