# FAQ

Short answers to common questions.

## What is Lyse?

A free, open-source tool that scores how closely your UI code follows your design system. Score from 0 to 100. Runs locally as a CLI or via MCP for Cursor / Claude Code.

## How is this different from ESLint?

ESLint catches generic JavaScript / TypeScript issues. Lyse catches **design-system-specific** issues: hardcoded colors that should use tokens, native HTML elements that shadow your components, missing Storybook coverage.

Lyse uses ESLint under the hood for parts of the a11y rule (via `eslint-plugin-jsx-a11y`). Lyse composes with ESLint rather than replacing it.

## How is this different from Storybook / Chromatic / Zeroheight?

- **Storybook** = component docs + visual playground.
- **Chromatic** = visual regression testing on Storybook stories.
- **Zeroheight / Supernova** = narrative documentation hubs for design systems.

Lyse is the **measurement and enforcement layer** that none of these provide. You'd use Lyse alongside one or more of these tools, not instead of them.

## How does the Health Score work?

```
finalScore = equal-weight mean of axisScore across active axes
```

Each of the 6 axes (tokens, a11y, components, stories, ai-surface, ai-governance) is computed from its rule findings. Inactive axes (no opportunities visible in your repo) are omitted from the mean — no weights to rebalance.

Full details: [`health-score.md`](./health-score.md).

## What's a "good" score?

| Score | Reading |
|---|---|
| 90+ | Excellent — likely a small DS with high discipline. |
| 75–89 | Healthy — typical for mature in-house design systems. |
| 60–74 | Average — real drift exists but tractable. |
| 40–59 | At risk — the DS is partially aspirational. |
| 0–39 | The DS is not enforced. |

The trend matters more than the absolute number.

## Does my code leave my machine?

**No.** The CLI is fully local. Source is parsed, scored, and reported on your machine. Nothing is sent anywhere.

If you opt in to telemetry — by answering "y" to the first-run prompt on `lyse audit` or by running `lyse telemetry on` — Lyse sends anonymous metadata: an anonymous repo bucket fingerprint and the score. No file contents, no paths, no identifiers. Consent is persisted to `~/.lyse/consent.json` and can be revoked at any time with `lyse telemetry off`. See [`PRIVACY.md`](../../PRIVACY.md).

## What frameworks does it support?

React (TSX/JSX), Tailwind utility classes, CSS, styled-components / Emotion template literals.

Vue, Svelte, Solid, Angular — planned.

Vanilla HTML / web components — partial (a11y rule covers it; tokens require config).

## Can I add my own rules?

The 12 built-in rules are stable, but `lyse init` with a BYOK LLM (Anthropic / OpenAI / Ollama / IDE-MCP) can generate additional rules tailored to your repo. Generated rules live in `.lyse/generated-rules.yaml`, are committed alongside your code, and run as deterministic static analysis on every audit.

If you want a rule added to the core ruleset, [open an issue](https://github.com/lyse-labs/lyse/issues/new/choose) describing the rule.

## What does it cost?

Lyse is free open source under AGPLv3 + Commercial dual license. The CLI and the MCP server are free for OSS / internal use.

## Why AGPLv3?

To prevent AWS-style rebundling of the engine as a hosted service without contributing back. If you want to embed Lyse in a closed-source commercial product, see [`COMMERCIAL.md`](../../COMMERCIAL.md).

For everyday OSS use (CLI, CI, internal tooling), AGPLv3 has no practical difference from MIT.

## Is auto-fix safe?

Yes. `lyse fix` runs 6 safety guards before touching any file: clean git tree, git repo required, token map discoverable, high-confidence codemods only by default, 200-file cap per run, dry-run in non-TTY contexts. Details and overrides in [`cli-reference.md`](./cli-reference.md). Always review the diff — `lyse fix --dry-run` is your friend.

## Will Lyse break my build?

By default, no — Lyse reports findings but doesn't fail. To make it fail on a threshold:

```bash
lyse audit --threshold=70
```

Introduce thresholds gradually: start at `current_score - 5` and tighten the bar as drift goes down.

## What about false positives?

Every linter has them. Lyse handles them three ways:

1. **Allowlist inline:** `// lyse-disable-next-line <rule-id>`.
2. **Configure tolerance:** some rules (color matching, spacing snapping) accept a tolerance.
3. **Disable the rule:** if a rule doesn't make sense for your project, turn it off in `.lyse.yaml`.

If you see a false positive that looks like a Lyse bug (rather than a config issue), please [file an issue](https://github.com/lyse-labs/lyse/issues/new/choose).

## Does it work with my IDE?

Cursor, Claude Code, and any MCP-compatible IDE: yes, see [`mcp-server.md`](./mcp-server.md).

VS Code without MCP: the CLI works in the integrated terminal. A native VS Code extension is on the roadmap.

JetBrains IDEs: the CLI works in the terminal. No native plugin yet.

## Can I run it offline?

Yes. After the initial install (`npx -y lyse`), all subsequent runs are fully offline.

Telemetry and the public bench require network — both are opt-in.

## How fast is it?

On a typical project (500–2000 source files): 2–5 seconds.
Cached re-audit: < 1 second.
MCP `audit_file` per file: 50–200ms cold; a few ms warm (the repo context — tokens, stories, config — is cached per project root across calls, so a burst of single-file audits stays well under the 300ms P95 budget even on Carbon-scale repos).

Larger monorepos scale linearly. If you see audit times above 30 seconds on a project under 10k files, that's a bug — please file an issue.

## Does the score include design tokens that aren't yet defined?

No. Lyse reports hardcoded color literals (`#3B82F6`) as findings on the `tokens/no-hardcoded-color` rule, regardless of whether you have tokens defined yet. If you have no token system at all, every color literal is a finding.

The pragmatic path:
1. Run Lyse and accept a low initial score.
2. Define your first 5–10 tokens.
3. Use `suggest_fix` (via MCP) to auto-replace literals with tokens.
4. Re-run and see the score improve.

## What happens to my findings when the rule version changes?

Each rule has a stable `id` and a `version` (`v1`, `v2`, ...). When a rule version is bumped:

- Findings include both the rule ID and version.
- Existing CI thresholds keep working.
- The CHANGELOG notes what changed in the new version.

Rule behavior never changes silently — every behavioral change is a version bump and a CHANGELOG entry.

## Can I see Health Scores for other open-source DS?

You can score any public repo yourself:

```bash
git clone https://github.com/shadcn-ui/ui
cd ui
npx @lyse-labs/lyse audit
```

Or point Lyse at a path:

```bash
npx @lyse-labs/lyse audit ./path/to/repo
```

## Can I turn off the Storybook coverage axis?

Yes. Stories are a documentation-hygiene signal, not a correctness signal — if you don't use Storybook, set `stories/coverage: off` in `.lyse.yaml` and the axis becomes N/A (excluded from the equal-weight mean).

## Why doesn't Lyse have a hosted web dashboard?

Lyse is local-first by design. The CLI and the MCP server are the full surface.

## What does Lyse send to my LLM?

Only at `lyse init` (if you opt into LLM-assisted setup): `package.json`
+ `tailwind.config.*` + `.storybook/main.*` + directory tree (folder names)
+ 5 representative source files (≤ 5 KB each). Total ≤ 20 KB.

Never: secrets, env files, files matching `.gitignore`, files in
`node_modules` / `dist` / etc.

Run any command with `--dry-run` to preview.

## How do I disable LLM features?

Set in `.lyse.yaml`:

```yaml
llm:
  provider: 'none'
```

Or just don't set any API key. Lyse falls back to built-in rules.

## What happens if my LLM is unreachable?

`lyse audit` never crashes — it uses built-in rules + whatever generated rule
pack exists locally.

`lyse init` falls back to the static heuristics path if the LLM fails after
3 retries.

## Can my team share a rule pack?

Yes — `.lyse/generated-rules.yaml` is committed to your repo. Push it to
your shared branch and your teammates use the same pack without re-running
`lyse init`.

## Is there a community?

Yes:

- [GitHub Discussions](https://github.com/lyse-labs/lyse/discussions) — questions, ideas, patterns.
- [Twitter @lyse_dev](https://twitter.com/lyse_dev) — release notes, news.
- Bug reports → [GitHub Issues](https://github.com/lyse-labs/lyse/issues/new/choose).
- Security issues → [private advisory](https://github.com/lyse-labs/lyse/security/advisories/new).

A Discord / Slack may come later if there's demand. For now the project stays lightweight.

## Who built this?

Lyse Labs.

## Where is the project based?

Paris, France.

## Is there a commercial offering?

The free OSS tool is what Lyse offers publicly today. For closed-source embedding under a commercial license, see [`COMMERCIAL.md`](../../COMMERCIAL.md).

## I have a question that's not answered here.

Open a [GitHub Discussion](https://github.com/lyse-labs/lyse/discussions/new) — answers benefit everyone.
