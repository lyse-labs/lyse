# `versioning/changelog-present`

> **Axis:** AI surface · **Severity:** warning · **Auto-fixable:** no · **Version:** v1

Detects whether the repository ships a version-structured changelog and signals AI-Consumable readiness (Face A).

## Why

A design system without a structured changelog forces every consumer — human or AI agent — to reverse-engineer what changed from the git log or release tags. For AI-readiness specifically, an agent updating an app against a new DS version needs machine-readable change and breaking-change information to avoid silently breaking the app.

The check is intentionally lenient. Any Keep-a-Changelog-style or `v`-prefixed version heading counts, and the file may be named `CHANGELOG`, `HISTORY`, or `CHANGES`. It is a deterministic presence/structure check, so synthetic precision equals real precision — that is why it can contribute to the Health Score.

## Where the rule looks

At the repo root (first match wins):

- `CHANGELOG.md`, `CHANGELOG`, `CHANGELOG.mdx`, `changelog.md`
- `HISTORY.md`
- `CHANGES.md`
- `docs/CHANGELOG.md`

A file counts only when it contains at least one **version-structured heading** matching:

```
## [1.2.3]      (Keep a Changelog)
## v1.2.3
## 1.2.3 …
```

The heading regex requires a semver-ish `x.y` or `x.y.z`, so prose headings (`## Changelog`, `## Notes`) do not match.

## Bad

A repo with no changelog at all (single warning):

```
my-ds/
├── src/
├── package.json
└── README.md
# no CHANGELOG / HISTORY / CHANGES
```

A changelog with only prose and no version headings (single warning):

```md
# Changelog

We ship updates regularly. See the releases page for details.
```

## Good

A Keep-a-Changelog file:

```md
# Changelog

## [1.2.0] - 2026-01-01
### Added
- New Button variant

## [1.1.0] - 2025-11-15
### Fixed
- Token alias resolution
```

A `v`-prefixed `HISTORY.md` also satisfies the rule:

```md
## v1.2.0
- Added Button variant
```

## What the rule checks

| Severity | Condition |
|---|---|
| `warning` | No changelog candidate file has a version-structured heading |
| (none) | A structured changelog is present — rule emits nothing |

The rule emits at most one finding, anchored at `CHANGELOG.md:1`.

## Allowlist

To mark the rule as not applicable for a repo, add the disable directive anywhere in the README (`README.md` / `README`):

```md
<!-- lyse-disable versioning/changelog-present -->
```

## What does NOT trigger this rule

- Changelog files larger than 2 MB — skipped to avoid pathological cases.
- Repos whose README carries the `lyse-disable versioning/changelog-present` directive.
- A `CHANGELOG.md` whose only headings are prose (no semver entries) — this **does** warn; the rule wants structured entries, not a placeholder file.

## See also

- [`ai-surface/agent-instruction-files`](./ai-surface-agent-instruction-files.md) — sibling AI-surface rule.
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
- [Keep a Changelog](https://keepachangelog.com/) — the format this rule recognizes.
