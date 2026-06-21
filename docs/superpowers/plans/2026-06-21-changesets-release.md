# Changesets release automation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Infra/config/docs feature — verification is via `changeset` CLI + YAML review, not vitest.

**Goal:** Automate `@lyse-labs/lyse` releases with Changesets in pre-release `alpha` mode, human-gated via a "Version Packages" PR.

**Architecture:** `@changesets/cli` dev dep + `.changeset/` config (pre alpha) + a `changesets/action` workflow replacing the tag-triggered `release.yml`. Docs updated.

## Global Constraints

- Stay in pre-release `alpha` (`-alpha.N`, dist-tag `alpha`).
- Tokenless default changelog generator (determinism; no GH-token dep).
- Never publish from this work — verify only up to `changeset version` (then revert the bump).
- Reuse the existing `NPM_TOKEN` secret + `--provenance`.
- pnpm workspace (`packages/*`); root `lyse-monorepo` is private → auto-ignored.

---

### Task 1: Install Changesets + config (pre-alpha) + scripts

**Files:** `package.json` (root), `pnpm-lock.yaml`, `.changeset/config.json`, `.changeset/pre.json`, `.changeset/README.md`

- [ ] **Step 1:** `pnpm add -Dw @changesets/cli` (root dev dep).
- [ ] **Step 2:** `pnpm changeset init` (creates `.changeset/config.json` + README).
- [ ] **Step 3:** Edit `.changeset/config.json`: `baseBranch: "main"`, `access: "public"`, `commit: false`, default changelog (`"@changesets/cli/changelog"`).
- [ ] **Step 4:** `pnpm changeset pre enter alpha` (creates `.changeset/pre.json`, mode alpha).
- [ ] **Step 5:** Add root scripts: `"changeset": "changeset"`, `"version": "changeset version"`, `"release": "pnpm --filter @lyse-labs/lyse build && changeset publish"`.
- [ ] **Step 6 (verify):** `pnpm changeset status` runs clean; `cat .changeset/pre.json` shows `"mode":"pre","tag":"alpha"`.
- [ ] **Step 7 (commit):** `git add package.json pnpm-lock.yaml .changeset && git commit -m "build(release): add Changesets (pre-alpha) (#53)"`

### Task 2: Replace tag-triggered release.yml with changesets/action

**Files:** `.github/workflows/release.yml`

- [ ] **Step 1:** Rewrite `release.yml`: trigger `on: push: branches: [main]`; permissions `contents: write`, `pull-requests: write`, `id-token: write`; steps = checkout / pnpm setup / node 22 + registry / `pnpm install --frozen-lockfile` / `changesets/action@v1` with `version: pnpm version`, `publish: pnpm release`, env `GITHUB_TOKEN` + `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` + `NPM_CONFIG_PROVENANCE: true`.
- [ ] **Step 2 (verify):** YAML parses (`node -e "require('js-yaml')..."` if available, else manual structural review); the action ref + inputs match changesets/action docs.
- [ ] **Step 3 (commit):** `git add .github/workflows/release.yml && git commit -m "ci(release): publish via changesets/action (#53)"`

### Task 3: Docs — CONTRIBUTING + CLAUDE.md

**Files:** `CONTRIBUTING.md`, `CLAUDE.md`

- [ ] **Step 1:** CONTRIBUTING.md — add a "Releases" section: every user-facing PR runs `pnpm changeset` (pick bump kind + summary); the bot's "Version Packages" PR IS the release; merging it publishes the `-alpha.N`.
- [ ] **Step 2:** CLAUDE.md — replace the manual bump+tag release guidance with the changeset flow; note the tag-triggered publish is retired.
- [ ] **Step 3 (commit):** `git add CONTRIBUTING.md CLAUDE.md && git commit -m "docs: release flow via Changesets (#53)"`

### Task 4: End-to-end verification (no publish)

- [ ] **Step 1:** Add a throwaway changeset (`patch` to `@lyse-labs/lyse`, summary "test"), run `pnpm changeset version`, confirm `packages/core/package.json` bumps `0.2.0-alpha.2 → 0.2.0-alpha.3` and CHANGELOG gets the entry. **Then `git checkout .` / delete the changeset to revert** — do NOT commit the bump.
- [ ] **Step 2:** `pnpm install` clean; `pnpm test` (full suite) still green (no source touched).
- [ ] **Step 3:** Final review of the 3 commits; open PR.

## Self-Review

- Spec coverage: config+pre-alpha (T1), workflow replace (T2), docs (T3), verify-no-publish (T4) ✓.
- Placeholders: none.
- Consistency: script names (`version`/`release`) match the `changesets/action` inputs (`version: pnpm version`, `publish: pnpm release`).
- Risk: `changeset version` mutates package.json/CHANGELOG — T4 explicitly reverts.
