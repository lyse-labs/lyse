# `ai-surface/agent-instruction-files`

> **Axis:** AI surface · **Severity:** warning · **Auto-fixable:** no · **Version:** v1

Detects the presence and frontmatter validity of agent-instruction bundles — Cursor rules (`.cursor/rules/*.mdc`) and Claude skills (`.claude/skills/*/SKILL.md`) — and signals AI-Consumable readiness.

## Why

Cursor rules and Claude skills are the contract surface for two of the most-used coding agents in 2026. Without at least one of these bundles, the agent has no project-specific guidance signal beyond `AGENTS.md`/`CLAUDE.md`, and even those don't carry the same auto-attach (`globs`) or auto-load (`name` + `description`) semantics.

Beyond presence, the *frontmatter* matters. Cursor uses `globs` to decide which rule fires for which file edit; missing `globs` silently disables the rule. Claude skills are matched by their `name` + `description` pair — the description is the prompt the agent uses to decide whether to load the skill, so a missing or vague description is invisible.

A long instruction file also costs context on every load. The Anthropic skills documentation and the Cursor rules documentation both recommend keeping each file small (~5 KB).

## Where the rule looks

At the repo root:

- `.cursor/rules/**/*.mdc` — Cursor rule files (markdown + YAML frontmatter).
- `.claude/skills/*/SKILL.md` — Anthropic Claude skill bundles.

Each file's YAML frontmatter (between `---` markers) is parsed and validated.

## Bad

A repo with no agent instruction bundles at all (single warning):

```
my-repo/
├── src/
├── package.json
└── README.md
# no .cursor/rules/ and no .claude/skills/
```

A Cursor rule missing required `globs` (error):

```mdc
---
description: TypeScript style guide
---

# TS style
```

A Claude skill with non-kebab-case `name` (warning) and missing `description` (error):

```md
---
name: PR_Checklist
version: 1.0.0
---

# PR checklist
```

## Good

A minimal Cursor rule with the two required keys:

```mdc
---
description: TypeScript style guide for this monorepo
globs: ["src/**/*.ts", "src/**/*.tsx"]
alwaysApply: false
---

# TypeScript style

Use strict mode. Prefer type aliases over interfaces.
```

A minimal Claude skill:

```md
---
name: pr-checklist
description: Generates a PR checklist from the diff (≤200 chars)
version: 1.0.0
---

# PR checklist skill

Procedural instructions for the agent.
```

## What the rule checks

| Severity | Condition |
|---|---|
| `warning` | Neither `.cursor/rules/*.mdc` nor `.claude/skills/*/SKILL.md` present |
| `error` | `.mdc` file has no YAML frontmatter, or invalid YAML |
| `error` | Cursor rule missing `description` or `globs` |
| `error` | Claude skill missing `name` or `description` |
| `warning` | File > 5 KB (token-budget concern) |
| `warning` | Claude skill `name` is not kebab-case |
| `warning` | `description` exceeds 200 chars |
| `warning` | Cursor rule `alwaysApply` present but not a boolean |

## Allowlist

For a single file you want the rule to ignore (e.g., a legacy rule kept around for documentation):

```ts
// lyse-disable ai-surface/agent-instruction-files
```

You can also exclude paths via `.lyse.yaml`:

```yaml
excludePaths:
  - ".cursor/rules/legacy/**"
```

## What does NOT trigger this rule

- Files larger than 500 KB — skipped (treated as oversize, emits one warning, not parsed).
- Files matching `excludePaths`.
- Repos that ship only `AGENTS.md`/`CLAUDE.md` (without Cursor rules or Claude skills) get a *warning* — not an error — to nudge adoption without breaking the build.

## See also

- [Cursor rules documentation](https://cursor.com/docs/context/rules)
- [Claude skills documentation](https://docs.claude.com/en/docs/agents-and-tools/skills)
- [`ai-surface/agents-md-quality`](./ai-surface-agents-md-quality.md) — sibling rule covering `AGENTS.md` quality.
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
