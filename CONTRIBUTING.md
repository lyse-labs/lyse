# Contributing to Lyse

Thanks for considering a contribution. Lyse is dual-licensed AGPLv3 / Commercial — by submitting code, you agree to license it under the same terms.

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you are expected to uphold it.

Report unacceptable behavior to **contact@getlyse.com**.

## Ways to contribute

- **Report bugs** — see [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml).
- **Request features** — see [feature request template](.github/ISSUE_TEMPLATE/feature_request.yml).
- **Improve documentation** — typos, clarity, missing sections all welcome.
- **Add or refine rules** — see "Rule contributions" below.
- **Triage issues** — comment on bugs, reproduce, narrow down.

## Development setup

Prerequisites:
- Node.js 22+ (use `nvm use` — repo has `.nvmrc`)
- pnpm 9.12+

```bash
git clone https://github.com/lyse-labs/lyse
cd lyse
pnpm install
pnpm test
pnpm -r build
```

To run the CLI from source:

```bash
pnpm -F lyse build && node packages/core/dist/cli.js audit fixtures/full-ds
```

## Project structure

- `packages/core/` — the `lyse` npm package (CLI, library, MCP server, codemods).
- `docs/` — public documentation.
- `.github/` — issue/PR templates, workflows.

The benchmark corpus (70 OSS design systems) lives in the separate public
repository [`lyse-labs/lyse-bench`](https://github.com/lyse-labs/lyse-bench)
(CC BY 4.0).

The Cloudflare Worker that powers `api.getlyse.com` and internal
engineering documents live in a separate private repository
(`lyse-labs/lyse-internal`). External contributors can request
relevant context per-issue.

## Pull request process

1. Fork and create a branch: `feat/<topic>`, `fix/<topic>`, `docs/<topic>`, or `chore/<topic>`.
2. Write tests first (TDD). Tests live next to the code they exercise.
3. Make the smallest change that solves the problem. YAGNI applies.
4. Run `pnpm test` and `pnpm lint` — both must pass.
5. Add a CHANGELOG entry under `## [Unreleased]`.
6. Open a PR using [the template](.github/PULL_REQUEST_TEMPLATE.md).

Reviews typically come within 3 business days.

## Commit message convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(rules): add tokens/no-hardcoded-font-size rule
fix(scorer): renormalize weights when stories axis is N/A
docs(rules): clarify allowlist semantics
chore(deps): bump vitest to 2.1.0
```

Prefixes: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, `build`, `perf`.

## Code style

- Strict TypeScript. No `any` unless rigorously justified.
- No comments unless the WHY is non-obvious — well-named identifiers should do the work.
- Deterministic outputs. Sort keys in JSON, sort findings by `(file, line, column)`.
- No emojis in code or comments.

Lint config: `eslint.config.mjs` (flat config, `typescript-eslint` meta-package).

## Rule contributions

Adding a new rule is the highest-value contribution. The path:

1. **Open an issue first.** Describe the rule's purpose, when it applies, when it shouldn't. We'll align on scope before code.
2. **Implement the rule.** Create `packages/core/src/rules/<rule-id>.ts` using `createLyseRule({ meta, ... })`. The full `meta` shape (axis, lyseRuleId, defaultSeverity, shortDescription, fullDescription, helpUri, rationale, examples, allowlist) is passed inline and registered automatically into `RULE_METADATA`.
3. **Add to the registry.** Append the rule to `packages/core/src/rules/registry.ts` (`ruleObjects`).
4. **Write the help page.** Create `docs/rules/<rule-id-slug>.md` — this is the helpUri target.
5. **Tests.** Create `packages/core/tests/rules/<rule-id>.test.ts` with at least: a positive case, a negative case, and an allowlist case.
6. **CHANGELOG.** Add a line under `## [Unreleased]` → `### Added`.

## Testing philosophy

- **Unit tests for rules** — small, focused, AST fixtures.
- **Integration tests for the runner** — fixtures repos in `packages/core/fixtures/`.
- **No mocking the parser** — SWC / PostCSS / Babel are real dependencies; mock-driven tests rot fast.
- **Subprocess smoke tests** — verify CLI binary is executable end-to-end (1 test, skipped in default suite).

Run individual tests: `pnpm -F lyse test -- path/to/file.test.ts`.

## Releasing (Changesets)

Releases are automated with [Changesets](https://github.com/changesets/changesets),
currently in pre-release **alpha** mode (versions are `-alpha.N`, published under
the `alpha` dist-tag).

**Every user-facing PR adds a changeset:**

```bash
pnpm changeset
```

Pick the bump kind (`patch` / `minor` / `major`) for `@lyse-labs/lyse` and write a
one-line summary. Commit the generated `.changeset/*.md` with your PR. (Docs-only
or internal-only PRs don't need one.)

**How a release happens (maintainers):**

1. When changesets land on `main`, a bot opens/refreshes a **"Version Packages"**
   PR that bumps `packages/core/package.json` (next `-alpha.N`) and updates
   `CHANGELOG.md` from the accumulated changesets.
2. **Merging that PR is the release** — CI runs `changesets/action` →
   `pnpm release` → `npm publish --provenance` under the `alpha` tag.

No manual `pnpm version` / `git tag` step — the old tag-triggered flow is retired.
Exiting alpha (`pnpm changeset pre exit`) is a deliberate maintainer decision.

## Questions

- **GitHub Discussions**: https://github.com/lyse-labs/lyse/discussions
- **Security vulnerabilities**: see [SECURITY.md](./SECURITY.md). Never open a public issue for vulnerabilities.

## Recognition

Contributors are listed on the GitHub repo's contributor page. Significant contributions earn a mention in the relevant CHANGELOG release.

— The Lyse Labs team
