# `ai-surface/shadcn-registry-valid`

> **Axis:** AI surface · **Severity:** warning · **Auto-fixable:** no · **Version:** v1

Detects whether the design system ships a valid shadcn-style component registry — the canonical AI-Consumable surface understood by the `shadcn` CLI and most coding agents today.

## Why

A valid `registry.json` is the single most reliable signal that a design system is AI-Consumable today. The shadcn CLI uses it to install components into downstream apps; coding agents (Cursor, Claude, GPT) increasingly look for it to discover and pull components instead of scraping source files.

When a repo declares `components.json` (the shadcn CLI marker) but ships no registry, that's a strong indicator the team is on the shadcn path but hasn't published the consumable surface yet — a missed opportunity. When the registry is present but malformed, downstream tooling silently breaks: that's an error.

## How it detects

The rule looks for a shadcn-style registry at any of the canonical locations:

1. `registry.json` at the repo root (single-file consolidated registry), OR
2. `public/registry.json` (Next.js-style hosted registry), OR
3. `registry/*.json` (one file per component).

For each file, it validates the minimal [shadcn registry schema](https://ui.shadcn.com/docs/registry):

| Field | Required | Notes |
|---|---|---|
| `name` | yes | non-empty string |
| `type` | yes | one of `registry:ui`, `registry:lib`, `registry:hook`, `registry:block`, `registry:component`, `registry:page`, `registry:file`, `registry:style`, `registry:theme`, `registry:item` |
| `files` | yes | non-empty array; each entry needs a `path` string |
| `dependencies` | no | not validated |
| `registryDependencies` | no | not validated |
| `tailwind` | no | not validated |
| `cssVars` | no | not validated |

Both single-item registries (`{ name, type, files }`) and item collections (`{ items: [...] }` or `{ registry: [...] }`) are accepted.

## Bad

`registry.json` missing `type` and `files`:

```jsonc
{
  "$schema": "https://ui.shadcn.com/schema/registry.json",
  "name": "button"
}
```

`registry.json` with a `files` entry that has no `path`:

```jsonc
{
  "name": "button",
  "type": "registry:ui",
  "files": [{ "content": "..." }]
}
```

Truncated / malformed JSON (silent shadcn CLI failure):

```jsonc
{ "name": "button", "type": "registry:ui",
```

## Good

Single-item registry (the canonical shadcn shape):

```jsonc
{
  "$schema": "https://ui.shadcn.com/schema/registry.json",
  "name": "button",
  "type": "registry:ui",
  "dependencies": ["@radix-ui/react-slot"],
  "registryDependencies": ["utils"],
  "files": [
    { "path": "ui/button.tsx", "type": "registry:ui" }
  ],
  "tailwind": { "config": { "theme": { "extend": {} } } },
  "cssVars": {
    "light": { "--primary": "0 0% 0%" },
    "dark":  { "--primary": "0 0% 100%" }
  }
}
```

Item collection (one file lists many components):

```jsonc
{
  "items": [
    { "name": "button", "type": "registry:ui", "files": [{ "path": "ui/button.tsx" }] },
    { "name": "card",   "type": "registry:ui", "files": [{ "path": "ui/card.tsx" }] }
  ]
}
```

Per-component files under `registry/`:

```
registry/
├── button.json    { "name": "button", "type": "registry:ui", "files": [{ "path": "ui/button.tsx" }] }
├── card.json      { "name": "card",   "type": "registry:ui", "files": [{ "path": "ui/card.tsx" }] }
└── input.json     ...
```

## No auto-fix

Generating a registry automatically would require inferring component names, source paths, and optional tailwind/cssVars from a heuristic scan of the codebase — too lossy to be safe. Scaffolding a registry stub is on the roadmap for a future `lyse init` enhancement, but the codemod path is not.

## Allowlist

If your repo is on the shadcn path but legitimately ships its registry elsewhere (e.g., served from an HTTP API rather than a file), disable the rule in `.lyse.yaml`:

```yaml
rules:
  ai-surface/shadcn-registry-valid: off
```

Or scope it to a specific severity:

```yaml
rules:
  ai-surface/shadcn-registry-valid:
    severity: info
```

**Note on inline `// lyse-disable` directives:** this rule operates on JSON config files which do not support comments, so per-line inline directives don't apply. Use `.lyse.yaml` `excludePaths` for file-level skipping instead.

## What does NOT trigger this rule

- Repos with neither `components.json` nor any registry file → rule is N/A (no finding).
- Registry files larger than 4 MB → skipped.
- Files matching `designSystem.excludePaths` in `.lyse.yaml`.

## Configuration

```yaml
# .lyse.yaml
rules:
  ai-surface/shadcn-registry-valid:
    severity: warning
```

## See also

- [shadcn registry docs](https://ui.shadcn.com/docs/registry) — the upstream schema and CLI semantics.
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
- [`ai-surface/component-manifest-json`](./ai-surface-component-manifest-json.md) — a complementary signal for MCP-driven consumption.
