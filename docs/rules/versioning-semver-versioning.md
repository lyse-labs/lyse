# `versioning/semver-versioning`

> **Axis:** AI surface · **Severity:** warning · **Auto-fixable:** no · **Version:** v1

Detects whether the design system declares a valid semver `version` in `package.json`, and signals AI-Consumable readiness (Face A).

## Why

A design system without a valid semver version gives consumers — human or AI agent — nothing stable to pin against. An agent updating an app against the design system needs a machine-readable version to reason about compatibility and breaking changes.

The check is intentionally lenient. Any semver-valid version passes, including pre-1.0 (`0.x`) versions, which are common for legitimately-maintained design systems. It is a deterministic presence/structure check, so synthetic precision equals real precision — that is why it can contribute to the Health Score.

## Where the rule looks

1. Root `package.json`.
2. If the root has no valid-semver `version` (common for private monorepo roots), workspace manifests resolved from `workspaces` (npm/yarn/pnpm `package.json` field) or `pnpm-workspace.yaml` — e.g. `packages/*/package.json`.

The rule **passes if any** manifest declares a valid-semver `version`.

## Bad

No `version` field:

```json
{ "name": "@acme/ds", "description": "components" }
```

A non-semver value (tag, partial, date, range):

```json
{ "name": "@acme/ds", "version": "latest" }
{ "name": "@acme/ds", "version": "1.0" }
{ "name": "@acme/ds", "version": "2026-01-01" }
```

## Good

A stable version:

```json
{ "name": "@acme/ds", "version": "1.4.2" }
```

A pre-1.0 version is valid semver and passes:

```json
{ "name": "@acme/ds", "version": "0.3.0" }
```

Pre-release and build metadata are accepted:

```json
{ "name": "@acme/ds", "version": "2.0.0-beta.1+sha.abc" }
```

In a monorepo, a version on any workspace package satisfies the rule even when the private root has none:

```json
// package.json (root)
{ "name": "root", "private": true, "workspaces": ["packages/*"] }
// packages/ds/package.json
{ "name": "@acme/ds", "version": "1.0.0" }
```

## What the rule checks

| Severity | Condition |
|---|---|
| `warning` | No `package.json` (root or workspace) declares a valid-semver `version` |
| (none) | A valid-semver version is present — rule emits nothing |

The rule emits at most one finding, anchored at `package.json:1`.

## Allowlist

To mark the rule as not applicable for a repo, add the disable directive anywhere in the README (`README.md` / `README`):

```md
<!-- lyse-disable versioning/semver-versioning -->
```

## What does NOT trigger this rule

- A pre-1.0 (`0.x`) version — it is valid semver. (A future non-scored `info`
  signal may note the absence of a `≥1.0.0` stability contract.)
- `package.json` files larger than 1 MB — skipped to avoid pathological cases.
- Repos whose README carries the `lyse-disable versioning/semver-versioning` directive.

## See also

- [`versioning/changelog-present`](./versioning-changelog-present.md) — sibling versioning rule.
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
- [Semantic Versioning](https://semver.org/) — the version grammar this rule recognizes.
