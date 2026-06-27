# `ai-surface/llms-txt-structure`

> **Axis:** AI surface · **Severity:** warning · **Auto-fixable:** no · **Version:** v1

Detects whether a design-system repository ships a valid `llms.txt` at its root, per the [llmstxt.org](https://llmstxt.org/) specification — the AI-Consumable map that lets agents find your Quickstart, API reference, and policy docs without crawling the entire tree.

## Why

`llms.txt` (Tantum, 2024) is the emerging convention for handing AI agents a curated, token-cheap map of a project. For a design system this is the highest-leverage AI-Consumable surface: a single discoverable entry that points Cursor, Claude Code, Copilot Workspace, and custom agents at the canonical resources you want them to ground on.

Absence is a missed opportunity — agents fall back to scanning the README and source tree, which is slower, less reliable, and burns more tokens. Structural errors are scored harder than absence because consumers parse the file *assuming* it follows the spec; a malformed `llms.txt` silently breaks that contract.

The companion `llms-full.txt` (a single-file inlining of every linked document) is a useful convention to ship alongside, but this rule neither checks for it nor requires it — only `llms.txt` is inspected.

## Where the rule looks

- `llms.txt` at the repo root (required signal — the only file this rule reads).
- README at the repo root for an allowlist directive (`README.md`, `README`, or `readme.md`).

Files larger than 1 MB are skipped to avoid pathological cases.

## Bad

```text
Welcome to Acme DS. We ship Buttons and Cards.

- random link list
```

```text
# Acme DS

Skipping the summary blockquote.

## Docs

- [Quickstart](): no URL.
- [](https://acme.dev/api): no title.
```

These trigger:

- `error` — missing `# <title>` H1.
- `error` — missing `> <summary>` blockquote.
- `error` — section list rows missing a title or URL.
- `warning` — when `llms.txt` is absent entirely.

## Good

```text
# Acme DS

> A token-first React design system for fast UI delivery.

A short context paragraph (optional).

## Docs

- [Quickstart](https://acme.dev/quickstart): Get started in 3 minutes.
- [API reference](https://acme.dev/api): Full method index.

## Examples

- [Hello world](https://acme.dev/hello): Minimal example.

## Optional

- [Blog](https://acme.dev/blog): Long-form deep dives.
```

For maximum effect, ship `llms-full.txt` alongside — a single-file expansion of `llms.txt` with every linked document inlined.

## Allowlist

For repos where the rule should be silent (e.g., the AI-surface signal is intentionally out of scope), add the directive anywhere in the root README:

```markdown
<!-- lyse-disable ai-surface/llms-txt-structure -->
```

When the directive is present, the rule reports `0 findings` and `0 opportunities` for the repo.

Other allowlisted cases:

- Files larger than 1 MB at `llms.txt` — skipped.

## Configuration

```yaml
# .lyse.yaml
rules:
  ai-surface/llms-txt-structure:
    severity: warning
```

Set `severity: off` to disable the rule entirely (it then contributes neither findings nor opportunities to the AI-surface axis score).

## See also

- [llmstxt.org](https://llmstxt.org/) — the upstream specification.
- [`ai-surface/agents-md-quality`](./ai-surface-agents-md-quality.md) — the sibling rule that grades `AGENTS.md`.
- [`ai-surface/component-manifest-json`](./ai-surface-component-manifest-json.md) — the sibling rule that grades the component manifest.
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
