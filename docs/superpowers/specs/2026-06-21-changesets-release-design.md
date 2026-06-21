# Release automation with Changesets — design

**Status: APPROVED 2026-06-21 (Noé). Next: writing-plans → build.**
Flow: /using-superpowers. Issue: lyse-labs/lyse-internal#53.

## Problem

Releasing `@lyse-labs/lyse` is fully manual: bump `packages/core/package.json`,
move CHANGELOG `[Unreleased]` → dated section, merge, tag `vX`, push tag →
`release.yml` publishes. Doesn't scale with cadence or external PRs.

## Decision (locked with Noé)

- Tool: **Changesets** (matches cadence: release per coherent chunk, human-gated;
  CHANGELOG already lives in the right place; JS-standard).
- Mode: **stay in pre-release `alpha`** — keep publishing `-alpha.N` under the
  `alpha` dist-tag. Exiting alpha is a later explicit decision.
- **Auto-publish workflow** (changesets/action): accumulate changesets → open a
  "Version Packages" PR → merging it publishes.

## Architecture

**Three isolated units:**

1. **`.changeset/config.json`** — Changesets config:
   - `baseBranch: "main"`, `access: "public"`, `commit: false` (the action commits).
   - `changelog: "@changesets/changelog-github"` (or the default
     `@changesets/cli/changelog` to avoid a GitHub-token dependency — pick the
     default to keep it tokenless and deterministic; see Honest limits).
   - The private root (`lyse-monorepo`) is auto-ignored (only published packages
     get versioned; root is `private`/version 0.0.0).
   - `.changeset/pre.json` present (via `changeset pre enter alpha`) so the repo
     stays in pre-release alpha mode.
   - `.changeset/README.md` (the standard explainer Changesets ships).

2. **`@changesets/cli` dev dependency** at the workspace root (`package.json`
   `devDependencies` + `pnpm-lock.yaml`), plus npm scripts:
   `"changeset": "changeset"`, `"version": "changeset version"`,
   `"release": "pnpm --filter @lyse-labs/lyse build && changeset publish"`.

3. **CI workflow `.github/workflows/release.yml`** (replace the tag-triggered
   one): on push to `main`, run `changesets/action@v1` with
   `version: pnpm version`, `publish: pnpm release`. It opens/updates the
   Version Packages PR; when that PR merges, it publishes with provenance using
   the existing `NPM_TOKEN`. Keep `id-token: write` for provenance; add
   `contents: write` + `pull-requests: write` so the action can open the PR.

## Data flow

```
Contributor PR  → adds .changeset/<name>.md (kind + summary)
push to main    → changesets/action:
                    if pending changesets → open/refresh "Version Packages" PR
                                            (bumps package.json + CHANGELOG, alpha)
                    if none pending       → no-op
merge Version PR → push to main → changesets/action → changeset publish
                    → pnpm build + npm publish --provenance --tag alpha
```

## Docs

- **CONTRIBUTING.md**: "every user-facing PR adds a changeset (`pnpm changeset`)";
  explain the kinds and that the Version Packages PR is the release.
- **CLAUDE.md**: update the release/commit guidance — PRs add a changeset; the
  manual bump+tag flow is retired.
- The existing hand-maintained `CHANGELOG.md` keeps working: Changesets appends
  to it; the current `[Unreleased]` content stays (one-time: leave as-is; new
  entries come from changesets).

## Verification (no real publish)

This is config + CI + docs — no vitest unit tests. Verify by:
1. `pnpm changeset status --since=main` runs without error.
2. Add a throwaway changeset → `pnpm changeset version` produces the correct
   `-alpha.N` bump in `packages/core/package.json` + CHANGELOG → **revert** (don't
   commit the bump; the action does it in CI).
3. `pnpm install` resolves the new dev dep; lockfile updated.
4. Workflow YAML is valid (actionlint if available, else manual review).
5. Full test suite still green (no source touched, but confirm nothing breaks).

The first real publish remains gated on Noé merging the first Version Packages
PR (CI holds `NPM_TOKEN`). We never publish from this work.

## Scope / YAGNI

- Single published package — no multi-package matrix.
- No `create-lyse` (deleted), npm only.
- `changelog-github` (PR-link annotations) deferred → use the tokenless default
  changelog generator to keep determinism and avoid a GH-token dependency.

## Honest limits

- Can't exercise the actual `npm publish` here (no token; must not publish) —
  validated up to `changeset version`. The end-to-end publish is proven only
  when CI runs the first Version Packages merge.
- Replacing the tag-triggered `release.yml` means the old `git tag vX` flow stops
  publishing; documented in CONTRIBUTING/CLAUDE so no one relies on it.
- Staying in alpha pre-mode: every release is `-alpha.N` under the `alpha`
  dist-tag; `npm i @lyse-labs/lyse` (latest) still resolves the last non-alpha,
  i.e. nothing until alpha is exited. This matches the current state.
