# `ai-surface/component-manifest-completeness`

> **Axis:** AI Surface · **Severity:** info · **Auto-fixable:** no · **Status:** experimental (not scored)

For each component entry in a lyse-style component manifest (`components.json` / `lyse.components.json`), checks that the entry documents `props` (non-empty array), `examples` (non-empty array), and — when `variants` is present — that it is not an empty array.

## Why

A component manifest that lists only `name` and `sourceFile` tells MCP servers _where_ a component lives but not _what_ it does. Agents still have to read the source file to discover props, variants, and usage examples — negating the 5× cost reduction the manifest is meant to deliver.

This rule closes the gap: a complete entry lets an MCP tool answer "how do I use Button?" with a 50-token lookup instead of a 500-token file read.

Severity is intentionally `info` — the manifest works for discovery without completeness data; completeness is a quality improvement, not a correctness issue.

## Boundary with `ai-surface/component-manifest-json`

| Concern | Rule |
|---|---|
| Manifest file is absent | `ai-surface/component-manifest-json` |
| Manifest file is present but entries are incomplete | `ai-surface/component-manifest-completeness` (this rule) |

This rule is **silent when no manifest exists** — the absence signal belongs to `component-manifest-json`. It only fires when a lyse-style manifest is found and a component entry is missing `props`, `examples`, or has a present-but-empty `variants` array.

## What is flagged

For each entry in the `components` array of a lyse-style manifest:

1. **Missing or empty `props`** — `props` is absent, `null`, or an empty array.
2. **Present-but-empty `variants`** — `variants` exists but is `[]`. (Absent `variants` is fine — not all components have meaningful variants.)
3. **Missing or empty `examples`** — `examples` is absent, `null`, or an empty array.

One finding is emitted per incomplete field per component entry.

## Bad

```json
{
  "components": [
    {
      "name": "Button",
      "sourceFile": "src/button.tsx"
    },
    {
      "name": "Badge",
      "sourceFile": "src/badge.tsx",
      "props": [],
      "variants": [],
      "examples": []
    }
  ]
}
```

- First entry: flags missing `props` and missing `examples`.
- Second entry: flags empty `props`, empty `variants`, and empty `examples`.

## Good

```json
{
  "components": [
    {
      "name": "Button",
      "sourceFile": "src/button.tsx",
      "props": [
        { "name": "variant", "type": "string" },
        { "name": "disabled", "type": "boolean" }
      ],
      "variants": ["primary", "secondary", "ghost"],
      "examples": [
        "<Button variant=\"primary\">Save</Button>",
        "<Button variant=\"ghost\" disabled>Cancel</Button>"
      ]
    }
  ]
}
```

## What is NOT flagged

- Repos with no lyse-style manifest — silently skipped; `component-manifest-json` owns that signal.
- Entries without a `name` field — skipped; `component-manifest-json` owns name-presence validation.
- `variants` absent entirely — that is fine; not all components need named variants.
- Object-form manifests (keyed by component name) — not checked for completeness (structure-only convention in lyse).
- shadcn/ui `components.json` (CLI config) — detected via `$schema` or `aliases` and skipped.

## Allowlist

```
lyse-disable ai-surface/component-manifest-completeness
```

Or per-file at the top of `components.json` — not applicable for JSON; add the file path to `.lyse.yaml` `exclude`:

```yaml
# .lyse.yaml
exclude:
  - "legacy/components.json"
```

## Reliability

| Metric | Value |
|---|---|
| Status | experimental |
| Tier | B — structural check |
| Contributes to Health Score | no |
| Detection strategy | Deterministic JSON structure check |
| Real-world precision | not yet measured |
| Recall | not yet measured |

Tier-B means the rule verifies structure, not prose quality. Whether a `props` array actually reflects the component's real props is out of static scope — the rule only checks presence and non-emptiness. This is intentional: it keeps the rule deterministic and free of false positives.

Precision and recall calibration against real-world repos is pending a harvest step.

## See also

- [`ai-surface/component-manifest-json`](./ai-surface-component-manifest-json.md) — manifest existence + structure check
- [Health Score](../guide/health-score.md) — how rules combine into the final score
- [Configuration](../guide/configuration.md) — `.lyse.yaml` reference
