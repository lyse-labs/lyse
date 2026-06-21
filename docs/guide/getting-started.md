# Getting started with Lyse

Five minutes from install to first Health Score.

## Quick start (recommended)

The fastest path is the interactive wizard:

```bash
npm create lyse@latest
```

This runs `lyse init`, which detects your framework, generates `.lyse.yaml`, optionally wires your IDE's MCP config, and then shows your first Health Score — all in one shot. Accepts `--yes` to skip every prompt.

### Optional: LLM-assisted init

If you have `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` set, or if you're inside
Cursor / Claude Code with the Lyse MCP server installed, `lyse init` will
offer to generate a custom rule pack tailored to your repo's DS paradigm.

You decide once at setup. After that, all audits are 100% local and static.
Lyse Labs never sees your code.

---

## 1. Run the audit (30 seconds)

You don't need to install anything. Run from any directory:

```bash
npx @lyse-labs/lyse audit
```

You'll see something like:

```
  Health Score: 67/100

  ▸ Tokens:        58/100  (12 hardcoded colors found)
  ▸ Accessibility: 71/100  (3 missing alt texts)
  ▸ Components:    74/100  (5 native shadows used)
  ▸ Stories:       65/100  (8 components missing stories)
  ▸ AI surface:    62/100  (AGENTS.md absent)

  Run lyse explain <rule-id> for details.
```

That's it. The audit ran locally — no data left your machine.

## 2. Understand the score

The Health Score (0–100) is the equal-weight mean of every active axis:

- **Tokens** — colors, spacing, typography pulled from design tokens vs hardcoded.
- **Accessibility** — essentials: alt text, labels, focus, semantic HTML.
- **Components** — reusable components used vs native HTML re-implemented.
- **Stories** — Storybook coverage.
- **AI surface** — `AGENTS.md`, component manifest JSON, DS index export.

Inactive axes (no opportunities found in your repo) are omitted from the mean. A healthy DS lives in 75–90. Below 60 means real drift. Below 40 means the DS exists more on paper than in code.

The number is a conversation starter, not a verdict. See [`health-score.md`](./health-score.md) for the full formula and edge cases.

## 3. See what triggered the findings

```bash
npx @lyse-labs/lyse audit --format=json | jq '.findings[0]'
```

Each finding includes:

- The rule ID (`tokens/no-hardcoded-color`, etc.)
- File path + line + column
- The offending snippet
- A `helpUri` linking to the rule's documentation
- The auto-fix availability

For a deeper explanation of any rule:

```bash
npx @lyse-labs/lyse explain tokens/no-hardcoded-color
```

## 4. Configure for your project (optional)

Create `.lyse.yaml` at the repo root:

```yaml
designSystem:
  componentsModule: "@your-org/ui"
  excludePaths:
    - "packages/legacy/**"
    - "**/*.generated.tsx"
```

`componentsModule` tells Lyse where your reusable components live. Without it, the `components/no-native-shadows` rule will be skipped.

See [`configuration.md`](./configuration.md) for the full schema.

## 5. Wire into your AI coding tool (2 minutes)

Lyse exposes an MCP server so Cursor / Claude Code / Codex can audit code they write — before it lands in your repo.

The easiest way:

```bash
lyse mcp setup
```

This auto-detects your IDE and writes the correct config block. Or do it manually — for Cursor, add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "lyse": {
      "command": "npx",
      "args": ["-y", "lyse", "mcp"]
    }
  }
}
```

For Claude Code, use `.mcp.json` (same structure).

Your agent now has two tools available:

- `audit_file(path, content?)` — audit a file, including unsaved buffers.
- `suggest_fix(path, rule_id, line)` — get a unified diff that fixes a finding.

See [`mcp-server.md`](./mcp-server.md) for the full integration guide.

## 6. Improve the score

Run `lyse fix` to apply codemods in one shot (5 rules are auto-fixable; clean git tree required). The MCP server can also produce per-file patches with `suggest_fix`. The score is the start, not the goal.

## 7. Show your score (optional)

Run `lyse badge` to print a shields.io Health Score badge for your README:

```markdown
[![Lyse Health Score](https://img.shields.io/badge/Lyse-82%2F100_(A)-brightgreen)](https://github.com/owner/repo)
```

Use `lyse badge --write` for an auto-updating badge (writes `.lyse/badge.json`; refresh it in CI). See [`lyse badge`](./cli-reference.md#lyse-badge-path).

## What's next

- Browse [the rules](../rules/) to see what's enforced.
- Read [the Health Score formula](./health-score.md) to understand the equal-weight mean and renormalization.
- Read [the FAQ](./faq.md) for common questions.
- If something doesn't work, see [troubleshooting](./troubleshooting.md) or [open an issue](https://github.com/lyse-labs/lyse/issues/new/choose).

## What Lyse does NOT do

To save you from misreading the scope:

- ❌ Visual regression testing — that's Chromatic / Percy / Argos.
- ❌ Generic code linting — that's ESLint / Sonar.
- ❌ Performance — that's Lighthouse.
- ❌ Generate UI from designs — that's v0 / Bolt.

Lyse measures **design system adherence**. Use it alongside the others, not instead of them.
