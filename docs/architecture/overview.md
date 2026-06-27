# Architecture overview

End-to-end walkthrough of what happens when you run `npx @lyse-labs/lyse audit`.

## The pipeline

```
        ┌────────────────────────────────────────────────┐
        │                  lyse audit                     │
        └────────────────────────────────────────────────┘
                              │
                              ▼
        ┌────────────────────────────────────────────────┐
        │  1. Config resolution                          │
        │     - walk up for .lyse.yaml                   │
        │     - validate against JSON schema             │
        │     - merge with defaults                      │
        └────────────────────────────────────────────────┘
                              │
                              ▼
        ┌────────────────────────────────────────────────┐
        │  2. File walk                                  │
        │     - fast-glob with .gitignore honored        │
        │     - apply excludePaths / includePaths        │
        │     - group files by parser type               │
        └────────────────────────────────────────────────┘
                              │
                              ▼
        ┌────────────────────────────────────────────────┐
        │  3. Parsers                                    │
        │     - TS / TSX → SWC                           │
        │     - CSS / SCSS → PostCSS                     │
        │     - styled-components → Babel (fallback)    │
        │     produce: ParsedFiles                       │
        └────────────────────────────────────────────────┘
                              │
                              ▼
        ┌────────────────────────────────────────────────┐
        │  4. Loaders                                    │
        │     - tokens loader (from componentsModule)    │
        │     - components loader (named exports)        │
        │     - stories loader (story file discovery)    │
        │     - figma loader (stub, not yet wired)       │
        │     produce: RuleContext.designSystem          │
        └────────────────────────────────────────────────┘
                              │
                              ▼
        ┌────────────────────────────────────────────────┐
        │  5. Rule runner                                │
        │     - for each rule × each file → visit AST    │
        │     5a. Built-in rules (65, all static)        │
        │     5b. Pack loader (optional generated rules) │
        │         — loads .lyse/generated-rules.yaml     │
        │         — merges with built-in rules           │
        │     - collect findings                         │
        │     - apply allowlist directives               │
        │     produce: Findings[]                        │
        └────────────────────────────────────────────────┘

At `lyse init`, an optional LLM-generated rule pack can be saved to `.lyse/generated-rules.yaml` and is loaded alongside built-in rules on every subsequent audit.

                              │
                              ▼
        ┌────────────────────────────────────────────────┐
        │  6. Scorer                                     │
        │     - per-axis: weightedFindings / opps → 0..100 │
        │     - equal-weight mean over active axes       │
        │     - round                                    │
        │     produce: AuditResult                       │
        └────────────────────────────────────────────────┘
                              │
                              ▼
        ┌────────────────────────────────────────────────┐
        │  7. Reporter                                   │
        │     - text / json / sarif                      │
        │     - deterministic ordering                   │
        │     produce: stdout or file                    │
        └────────────────────────────────────────────────┘
                              │
                              ▼
        ┌────────────────────────────────────────────────┐
        │  8. Telemetry (opt-in only)                    │
        │     - if ~/.lyse/consent.json accepted: true   │
        │     - append to .lyse/events.ndjson (local)    │
        └────────────────────────────────────────────────┘

Note: `.lyse/events.ndjson` is the opt-in telemetry log (written only when
`~/.lyse/consent.json` records `accepted: true` — set by the first-run prompt
on `lyse audit` or by `lyse telemetry on`). The audit-delta history is a
separate file: `.lyse/history.ndjson`, written on every audit run regardless
of telemetry opt-in (module: `history/ndjson-store.ts`). These two files
serve different purposes and must not be confused.
                              │
                              ▼
                          exit code
```

## Module map

```
packages/core/src/
├── cli.ts                   # citty entrypoint, subcommand routing
├── index.ts                 # library entry, VERSION constant
├── types.ts                 # shared types (Rule, RuleContext, AuditResult, etc.)
├── walker.ts                # fast-glob wrapper, gitignore-aware
├── config/
│   └── schema.ts            # .lyse.yaml discovery + Zod validation (loadConfig)
├── parsers/
│   ├── ts.ts                # SWC parser
│   ├── css.ts               # PostCSS parser
│   └── css-in-js.ts         # Babel for styled-components / Emotion
├── loaders/
│   ├── tokens.ts            # resolve token references from componentsModule
│   ├── components.ts        # enumerate named exports of componentsModule
│   ├── stories.ts           # discover .stories.* files
│   └── figma.ts             # stub, not yet wired
├── rules/
│   ├── manifest.ts          # RULE_METADATA — derived from META_REGISTRY
│   ├── registry.ts          # exports ruleObjects (65 rule instances) + ruleMap (O(1) lookup)
│   ├── pack-loader.ts       # load .lyse/generated-rules.yaml
│   ├── pack-validator.ts    # validate rule pack schema
│   ├── _skip-context.ts     # shared helpers (isInsideCodeDisplay, isInsideSkippedJsxAttr)
│   ├── _codemod-adapter.ts  # codemod dispatch wrapper
│   ├── tokens-no-hardcoded-color.ts
│   ├── tokens-no-hardcoded-spacing.ts
│   ├── tokens-dtcg-conformance.ts
│   ├── tokens-description-coverage.ts
│   ├── components-shadow-native.ts
│   ├── a11y-essentials.ts
│   ├── storybook-coverage.ts
│   ├── naming-component-pascalcase.ts
│   ├── naming-hook-prefix.ts
│   ├── ai-surface-agents-md-quality.ts
│   ├── ai-surface-component-manifest-json.ts
│   ├── ai-surface-ds-index-exported.ts
│   └── templates/           # rule templates used by LLM-assisted generation
│       ├── registry.ts      # template name → builder mapping
│       ├── types.ts         # RuleTemplate interface
│       ├── _regex-utils.ts  # shared escapeRegExp util
│       ├── js-prop-token-compliance.ts
│       ├── js-call-token-compliance.ts
│       ├── css-property-token-compliance.ts
│       ├── tailwind-utility-class-compliance.ts
│       ├── import-source-restriction.ts
│       ├── naming-convention.ts
│       ├── storybook-coverage-template.ts
│       └── a11y-jsx-template.ts
├── rule-runner.ts           # iterate rules × files, collect findings
├── scorer.ts                # axis scores, renormalization, final round
├── reporters/
│   ├── terminal.ts
│   ├── json.ts
│   ├── sarif.ts
│   └── markdown.ts          # AGENTS.md generator
├── codemods/
│   ├── index.ts             # dispatcher: rule_id + finding → codemod
│   ├── safety.ts            # 6 safety guards + buildClassifyContext / countAutoFixable
│   ├── diff.ts              # unified-diff utilities
│   ├── tokens-color.ts
│   ├── tokens-spacing.ts
│   ├── shadow-native.ts
│   ├── naming-component-pascalcase.ts
│   └── naming-hook-prefix.ts
├── identity/
│   └── repo-bucket.ts       # SHA-256 anonymous fingerprint
├── entitlement/
│   ├── check.ts             # JWT verify (jose)
│   ├── keys.ts              # embedded ed25519 public key
│   └── index.ts             # checkEntitlement(feature)
├── telemetry/
│   └── local-log.ts         # opt-in NDJSON event log (.lyse/events.ndjson)
├── llm/
│   ├── types.ts             # LyseLlmProvider interface, LlmUsage, DetectionResult, RulePack
│   ├── provider.ts          # createProvider factory
│   ├── detector.ts          # detectLlmCredentials (env vars + config)
│   ├── sampler.ts           # sampleRepoForLlm (privacy-safe repo snapshot)
│   ├── generator.ts         # generateRulePack (orchestrates LLM calls + retry)
│   ├── prompts.ts           # system + user prompt builders
│   ├── cost-tracker.ts      # appendLlmCall (.lyse/llm-calls.jsonl)
│   └── providers/
│       ├── anthropic.ts     # AnthropicProvider
│       ├── openai.ts        # OpenAIProvider
│       ├── openai-compatible.ts # OpenAICompatibleProvider (Ollama, Together, etc.)
│       └── mcp.ts           # McpProvider (sentinel — delegates to host LLM via MCP)
├── commands/
│   ├── audit-pipeline.ts    # shared audit pipeline (config → rules → score)
│   ├── share.ts             # lyse share (clipboard)
│   ├── init.ts              # lyse init wizard
│   ├── explain.ts           # lyse explain (rule rationale + score breakdown)
│   └── mcp-setup.ts         # lyse mcp setup
├── detection/
│   ├── types.ts
│   ├── from-package-json.ts
│   ├── from-filesystem.ts
│   ├── from-git.ts
│   └── pre-flight.ts        # pre-flight orchestrator
├── history/
│   └── ndjson-store.ts      # .lyse/history.ndjson (audit delta)
├── menu/
│   ├── prompts.ts
│   └── action-menu.ts
├── share/
│   └── clipboard.ts
└── mcp/
    ├── server.ts            # StdioServerTransport
    └── tools/
        ├── audit-file.ts
        └── suggest-fix.ts
```

## Data shapes

### `ParsedFiles`

The output of step 3, consumed by step 5.

```ts
interface ParsedFiles {
  ts: Map<string, SwcModule>;        // path → SWC AST
  css: Map<string, PostCSSRoot>;      // path → PostCSS AST
  cssInJs: Map<string, BabelFile>;    // path → Babel AST (for template literals)
}
```

### `RuleContext`

Passed to every rule's visit function.

```ts
interface RuleContext {
  config: LyseConfig;
  designSystem: {
    tokens: TokenMap;
    components: Set<string>;
    stories: Set<string>;
    intentMap: Map<string, string>;
  };
  filePath: string;
  parsed: ParsedFiles;
  emit: (finding: Finding) => void;
}
```

### `Finding`

What rules emit.

```ts
interface Finding {
  ruleId: string;
  ruleVersion: string;
  filePath: string;
  line: number;
  column: number;
  severity: "error" | "warning" | "info" | "off";
  message: string;
  snippet: string;
  fixable: boolean;
  helpUri: string;
}
```

### `AuditResult`

The final shape, fed to reporters.

```ts
interface AuditResult {
  finalScore: number;          // 0–100, equal-weight mean of active axes
  tier: "Foundational" | "Managed" | "Defined" | "Quantitative" | "Autonomous";
  scoringVersion: "scoring-v1";
  axes: AxisScore[];           // one entry per axis: tokens, a11y, components, stories, ai-surface
  findings: Finding[];          // sorted by (path, line, column)
  meta: {
    lyseVersion: string;
    rulesEnabled: string[];
    filesScanned: number;
    timestamp: string;
    repoBucket?: string;        // if telemetry opted in
  };
}

interface AxisScore {
  axisId: "tokens" | "a11y" | "components" | "stories" | "ai-surface";
  score: number | null;          // null when N/A
  weightedFindings: number;
  opportunities: number;
}
```

## Determinism rules

The pipeline is deterministic by construction:

1. **File walk** sorts results before consumption.
2. **Parsers** produce identical AST shapes for identical input (no timestamps in node IDs, etc.).
3. **Rule runner** iterates rules in alphabetical order (by ID), files in alphabetical order (by path).
4. **Scorer** uses pure arithmetic. No `Date.now()`, no `Math.random()`.
5. **Reporters** sort findings by `(path, line, column)` and sort JSON keys alphabetically.

Any non-determinism is a bug.

## Error handling philosophy

- **Parser errors** on a single file: log the error, skip the file, continue. Don't abort the audit.
- **Loader errors** (e.g., `componentsModule` cannot be resolved): warn the user, mark the relevant axis as N/A, continue.
- **Config errors**: hard fail with exit code 2 and a structured error message.
- **Rule runtime errors** (a rule throws): log with full stack, skip that rule for that file, continue. Surface in audit meta as `rulesWithErrors`.

The audit always tries to produce SOME score. Hard failure is reserved for configuration mistakes the user can fix.

## Concurrency

The audit is single-threaded by default. Within the rule runner:

- Files are processed sequentially.
- Rules are run per-file in a single pass.

Lyse does not use worker threads or async parallelism. Reasons:
1. Most projects are small enough that single-threaded is fast.
2. Adding concurrency complicates determinism and error handling.
3. Worker overhead exceeds the gain for typical workloads.

For very large monorepos (10k+ files), a `--workers=N` flag may be added later.

## Caching

There is no on-disk cache today. Every audit is a fresh full scan.

Possible future caching layers:
- Per-file parse cache (keyed by file hash).
- Per-rule result cache (keyed by file hash + rule version).

Caching has been deferred because:
1. Audits are already fast on typical projects.
2. Cache invalidation is the source of many bugs.
3. Determinism is easier to reason about without a cache.

## Telemetry path (opt-in only)

When `~/.lyse/consent.json` records `accepted: true` (set by the first-run prompt on `lyse audit` or by `lyse telemetry on`):

1. After step 7 (reporter), Lyse writes the event to `.lyse/events.ndjson` locally.

The CLI never POSTs events to the network on its own.

See [`PRIVACY.md`](../../PRIVACY.md) for the full data flow.

## What's next

- [`parsers.md`](./parsers.md) — parser strategy and tradeoffs.
- [`rules-engine.md`](./rules-engine.md) — how rules are structured and run.
- [`scoring.md`](./scoring.md) — the scorer's logic in detail.
- [`mcp-server.md`](./mcp-server.md) — how the MCP server wires into the engine.
- Cloudflare Worker — see [`PRIVACY.md`](../../PRIVACY.md) for what it receives. Source lives in a separate private repository.
