# `versioning/migration-guide-present`

> **Axis:** AI surface · **Severity:** warning · **Auto-fixable:** no · **Version:** v1

Detects whether the design system ships migration/upgrade guidance, and signals AI-Consumable readiness (Face A).

## Why

A design system without any migration/upgrade guidance forces every consumer — human or AI agent — to reverse-engineer how to move across a breaking version from diffs and release notes. For AI-readiness specifically, an agent upgrading an app needs a documented migration path to apply breaking-change codemods safely.

The check is lenient on both filename and location. It is a deterministic presence/structure check, so synthetic precision equals real precision — that is why it can contribute to the Health Score.

> **Caveat (honest scope).** Unlike a CHANGELOG (which every published package should have), a migration guide is strictly necessary only once a design system has shipped breaking changes. A brand-new `0.x` system with no breaking history may legitimately have none yet — for those, treat this warning as a forward-looking nudge, or silence it with the allowlist directive below. On the benchmark corpus of mature OSS design systems the false-positive rate is low, which is why it is scored.

## Where the rule looks

Any one of these satisfies the rule:

- A root file named `MIGRATION` / `MIGRATING` / `UPGRADE` / `UPGRADING` (with or without `.md` / `.mdx`).
- A migration/upgrade-named file under `docs/`, `doc/`, `documentation/`, or `.github/`.
- A `## Migration` / `## Upgrading` (or `### Migrating to …`) heading inside `CHANGELOG.md`, `CHANGES.md`, `HISTORY.md`, or `README.md`.

## Bad

A repo with no migration/upgrade guidance anywhere (single warning):

```
my-ds/
├── src/
├── package.json
├── README.md          # no Migration/Upgrading section
└── CHANGELOG.md        # version entries only, no migration section
```

## Good

A root migration guide:

```md
# MIGRATION.md

## v1 → v2
- `Button` is now `PrimaryButton`; run `npx @acme/ds-codemod v2`.
```

A migration section inside the CHANGELOG also satisfies the rule:

```md
## [2.0.0]

### Migration
Replace `<Button kind>` with `<Button variant>`.
```

## What the rule checks

| Severity | Condition |
|---|---|
| `warning` | No migration/upgrade file or heading found anywhere |
| (none) | Any migration/upgrade guide is present — rule emits nothing |

The rule emits at most one finding, anchored at `MIGRATION.md:1`.

## Allowlist

To mark the rule as not applicable for a repo (e.g. a pre-1.0 system with no breaking history), add the disable directive anywhere in the README:

```md
<!-- lyse-disable versioning/migration-guide-present -->
```

## What does NOT trigger this rule

- Guide files larger than 2 MB — skipped to avoid pathological cases.
- Repos whose README carries the `lyse-disable versioning/migration-guide-present` directive.

## See also

- [`versioning/changelog-present`](./versioning-changelog-present.md) — sibling versioning rule.
- [`versioning/semver-versioning`](./versioning-semver-versioning.md) — sibling versioning rule.
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
