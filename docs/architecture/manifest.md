# DS Machine Manifest

How `lyse manifest` and the MCP `get_ds_manifest` tool publish a stable,
versioned description of a design system for machine consumers.

## 1. What it is

The **DS Machine Manifest** is a stable, versioned, graph-derived contract
describing a design system — its tokens, component contracts, zone summary,
and extraction status — for machine consumers: coding agents, MCP clients,
and CI.

Internally, Lyse builds a **Design System Graph** (tokens, components,
stories, zones, multi-source token fusion) between its loaders and its
rules. That graph is an implementation detail, free to change shape as
Lyse's internals evolve. The manifest is a deliberate **projection** of the
graph onto a smaller, normalized surface that changes only under SemVer
(see [§4](#4-versioning-policy)). Optional/undefined fields on the internal
graph (for example a component prop's five optional fields) are normalized
to explicit `null` / `false` / `[]` so consumers get a predictable, fixed
JSON shape.

## 2. How to get it

**CLI:**

```bash
lyse manifest                       # current directory, prints JSON to stdout
lyse manifest ./apps/web            # a specific path
lyse manifest . --output manifest.json
```

**MCP tool `get_ds_manifest`:**

```jsonc
// input
{ "project_root": "/absolute/path/to/repo" }

// output
{ "manifest": /* DsManifest, see §3 */ }
```

Both paths build the graph and project it the same way — the CLI writes
the serialized JSON to stdout or a file, the MCP tool returns it as
structured content.

## 3. Schema (v1)

### Top level

| Field | Type | Description |
|---|---|---|
| `schemaVersion` | `1` | Integer contract version for the manifest shape itself. See [§4](#4-versioning-policy). |
| `generator` | `{ name: "lyse", version: string }` | The producing tool and its **package** version (e.g. `"0.2.0-alpha.6"`) — independent of `schemaVersion`. |
| `tokenSetHash` | `string` | Opaque content hash. **Covers the token set only** — see the callout below. |
| `tokens` | `ManifestToken[]` | Flattened token list, sorted by `id`. |
| `components` | `ManifestComponent[]` | Component contracts, sorted by `name`. |
| `zones` | `ManifestZoneSummary` | Per-zone-kind file counts. |
| `usage` | `ManifestUsageSummary[]` | Design-system usage, aggregated by edge kind. |
| `extraction` | `ManifestExtraction` | Always-present extractor status + remediation + token conflicts. See [§6](#6-degradation-contract). |

> **`tokenSetHash` covers the token set only** — the id, axis, and value of
> every token, hashed independently of everything else in the manifest. A
> change to `components`, `usage`, `zones`, or `extraction` **does not**
> move it; only a token being added, removed, or changing value does. Use
> it to detect "the token scale changed since I last read it," not "the
> manifest changed in any way."

### `tokens[]` — `ManifestToken`

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Token identifier, e.g. `"color.brand.primary"`. |
| `axis` | `string` (enum) | One of `colors`, `spacing`, `typography`, `radii`, `shadows`, `motion`, `breakpoints`, `zIndex`, `opacity`, `borderWidth`. |
| `value` | `string` | The token's raw resolved value, e.g. `"#3b82f6"`. |
| `source` | `string` (enum) | One of `tailwind-v3`, `tailwind-v4`, `dtcg`, `css-custom-property`, `scss-variable`, `style-dictionary`, `tokens-studio`, `figma-variables`, `external-package`. |

### `components[]` — `ManifestComponent`

| Field | Type | Notes |
|---|---|---|
| `name` | `string` | |
| `module` | `string` | Import specifier, e.g. `"@acme/ds"`. |
| `file` | `string \| null` | Source file path; `null` when it can't be resolved. |
| `exportKind` | `"named" \| "default" \| "unknown"` | |
| `isDesignSystem` | `boolean` | Whether this is recognized as design-system-owned, as opposed to a consumer's own component. |
| `detection` | `"module-config" \| "convention" \| "story-backref" \| "ds-self"` | How Lyse identified the component. |
| `usageCount` | `integer` | Number of files importing/using the component. |
| `props` | `ManifestProp[]` | See below. |
| `storyCount` | `integer` | Number of Storybook story exports referencing the component. |

### `components[].props[]` — `ManifestProp`

| Field | Type | Notes |
|---|---|---|
| `name` | `string` | |
| `type` | `string \| null` | Raw TypeScript type text; `null` when unavailable. |
| `optional` | `boolean` | |
| `default` | `string \| null` | |
| `variants` | `string[] \| null` | Extracted string-literal union members. `null` when the prop isn't a string-literal union — **not** the same as an empty list. |

### `zones` — `ManifestZoneSummary`

A fixed object with exactly seven keys, one per zone kind, each an integer
file count: `ds-source`, `app`, `story`, `test`, `generated`, `vendored`,
`config`. **All seven keys are always present, even at `0`** — an absent
key would be ambiguous with a genuine zero.

### `usage[]` — `ManifestUsageSummary`

| Field | Type | Notes |
|---|---|---|
| `kind` | `string` (enum) | Currently only `imports-ds-module`. |
| `files` | `integer` | Distinct files contributing to this kind. |
| `count` | `integer` | Total edge count across those files. |

Usage is aggregated by kind — never emitted as a per-file edge list — to
keep the artifact small on large repos ([§5](#5-guarantees)).

### `extraction` — `ManifestExtraction`

| Field | Type | Notes |
|---|---|---|
| `entries` | `ManifestExtractionEntry[]` | One entry per extractor (`tokens`, `components`, `stories`, `zones`). |
| `conflicts` | `ManifestTokenConflict[]` | Cross-source token conflicts: the same raw value on the same axis, declared by tokens from 2+ distinct sources. Two token ids that share a value from the *same* source do not conflict. |

`ManifestExtractionEntry`:

| Field | Type | Notes |
|---|---|---|
| `extractor` | `"tokens" \| "components" \| "stories" \| "zones"` | |
| `status` | `"ok" \| "degraded" \| "failed"` | |
| `evidence` | `Record<string, number>` | Extractor-specific counts, e.g. `{ "storyFiles": 140 }`. |
| `remediation` | `string \| null` | Actionable next step when `status` isn't `"ok"`. |

`ManifestTokenConflict`:

| Field | Type | Notes |
|---|---|---|
| `axis` | `string` (enum) | Same axis enum as `tokens[].axis`. |
| `value` | `string` | The raw value shared across the conflicting tokens. |
| `tokenIds` | `string[]` | The token ids that declare this value, deduplicated and sorted. |
| `sources` | `string[]` (enum) | The distinct sources that declared this value, deduplicated and sorted — always 2 or more (that's what makes it a conflict). Its length need not equal `tokenIds.length`: multiple token ids can share one source. |

### Example (trimmed)

```json
{
  "$schema": "https://github.com/lyse-labs/lyse/raw/main/schemas/v1/lyse-manifest.json",
  "schemaVersion": 1,
  "generator": { "name": "lyse", "version": "0.2.0-alpha.6" },
  "tokenSetHash": "sha256:9f2b...",
  "tokens": [
    { "id": "color.brand", "axis": "colors", "value": "#3b82f6", "source": "dtcg" }
  ],
  "components": [
    {
      "name": "Button",
      "module": "@acme/ds",
      "file": "src/Button.tsx",
      "exportKind": "named",
      "isDesignSystem": true,
      "detection": "module-config",
      "usageCount": 12,
      "props": [
        { "name": "variant", "type": "\"primary\" | \"secondary\"", "optional": true, "default": null, "variants": ["primary", "secondary"] }
      ],
      "storyCount": 1
    }
  ],
  "zones": { "ds-source": 1, "app": 1, "story": 0, "test": 0, "generated": 0, "vendored": 0, "config": 0 },
  "usage": [{ "kind": "imports-ds-module", "files": 1, "count": 3 }],
  "extraction": {
    "entries": [
      { "extractor": "stories", "status": "degraded", "evidence": { "storyFiles": 1 }, "remediation": "run 'lyse init'" }
    ],
    "conflicts": []
  }
}
```

The full JSON Schema lives at
[`packages/core/schemas/v1/lyse-manifest.json`](../../packages/core/schemas/v1/lyse-manifest.json)
and is the same file the `$schema` URL above resolves to.

## 4. Versioning policy

- `schemaVersion` (currently `1`) is the integer contract version for the
  manifest **shape**. It is independent of the npm package version, which
  travels in `generator.version`.
- **Additive, optional changes are minor**: a new optional field, or a new
  member appended to an existing enum (for example a new `TokenSource`),
  ships in a minor package release without bumping `schemaVersion`.
  Existing consumers keep working unmodified.
- **Removing a field, renaming a field, or changing what a field means**
  (its type or semantics) **is major**. Once ratified (see
  [§8](#8-status)), a major change requires an explicit maintainer-approved
  ADR before shipping — it is not a change an agent or a single contributor
  can make unilaterally.

## 5. Guarantees

- **Deterministic.** The same repo state produces byte-identical bytes:
  the manifest is passed through a recursive key-sorter, so every
  object's keys — `zones` included — come out alphabetical in the
  serialized JSON (`app, config, ds-source, generated, story, test,
  vendored`, not the `ZONE_KINDS` declaration order used internally).
  Array orderings are total (tokens by `id`, components by `name`, usage
  by `kind`), and the output ends in a trailing newline — the same
  determinism discipline as Lyse's other artifacts.
- **Zero-network, local-first.** Building the manifest reads only the
  repository tree. No network calls.
- **Built without running an audit.** `lyse manifest` builds the Design
  System Graph directly and projects it — it does not run the scorer and
  produces no findings. **Generating a manifest never touches your Health
  Score.**
- **Size-disciplined.** Zones are per-kind counts, not a per-file map;
  usage is aggregated by kind, not per-file edges — so the artifact stays
  small even on large, shadcn-scale repositories.

## 6. Degradation contract

`extraction` is **always present** — never omitted, never silently empty.
When an extractor's `status` is `degraded` or `failed`, its `remediation`
string names the actionable next step (for example, "run `lyse init`").

This is what lets a consumer tell "this design system genuinely has zero
tokens" apart from "the token extractor couldn't see this repo's tokens" —
an empty `tokens: []` alone cannot distinguish the two.

## 7. Relationship to other surfaces

Lyse exposes several graph-adjacent surfaces. They are not interchangeable:

- **MCP `get_design_system_graph`** returns Lyse's **internal, unstable**
  `DesignSystemGraph` — the exact structure the audit pipeline works with.
  It's a debugging/inspection view and may change shape without notice as
  Lyse's internals evolve. Prefer `get_ds_manifest` for anything you intend
  to depend on.
- **`.lyse/graph.json`** is a **write-only debug artifact**. Lyse writes it
  on every audit (`--graph-full` adds per-file usage edges) but never reads
  it back. It's for a human inspecting repo state, not a contract.
- **MCP `preflight_diff`** is the **write-time prevention** tool: pass it a
  proposed post-edit file buffer and it audits that buffer before you save
  it, returning a `pass` / `blocked` / `error` verdict with findings
  partitioned into `blocking` (only stable rules can block) and
  `advisory` (surfaced, never blocks). Call it *while writing code*.
  `get_ds_manifest`, by contrast, is what you read *before* writing code,
  to know what tokens and components already exist.

See [`docs/guide/mcp-server.md`](../guide/mcp-server.md) for the full MCP
tool reference and [`docs/architecture/mcp-server.md`](./mcp-server.md) for
how the tools are wired internally.

## 8. Status

v1 is published today with the versioning policy above already in effect,
but it is **pending owner ADR ratification as a frozen contract**. Treat
it as "v1 we intend to keep," not yet a fully frozen guarantee — the
expected outcome of ratification is confirming this policy as written, not
reopening the field shapes described in [§3](#3-schema-v1).
