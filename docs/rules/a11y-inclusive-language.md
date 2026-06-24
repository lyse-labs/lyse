# `a11y/inclusive-language`

> **Axis:** A11y · **Severity:** info · **Auto-fixable:** no · **Status:** stable (scored)

Flags a small, high-confidence set of non-inclusive terms in code and docs, with suggested replacements.

## Why

A design system's vocabulary propagates into every product and every developer who consumes it. Terms like `whitelist`/`blacklist` and `master`/`slave` carry exclusionary connotations and have established, clearer replacements. Fixing them in the source of truth fixes them everywhere downstream.

## How

Scans TS/JS, CSS, and CSS-in-JS sources for a **narrow, unambiguous** blocklist. Each match is one `info` finding with a suggested replacement:

| Term | Suggestion |
|---|---|
| `whitelist` | `allowlist` |
| `blacklist` | `denylist` / `blocklist` |
| `sanity check` | `quick check` / `confidence check` |
| `grandfathered` | `legacy` / `exempt` |
| `slave` | `replica` / `secondary` / `worker` |

Matching is case-insensitive and tolerant of camelCase / hyphen / underscore (`blackList`, `white-list`, `is_whitelisted`).

## Precision over recall

`master` and `dummy` are **deliberately not flagged**. They produce too many false positives in real codebases (`master` branch, `masterclass`, `dummy data`) to be worth flagging at this confidence level. The blocklist favors precision; a broader, configurable list may come later.

## Bad

```ts
const whitelist: string[] = [];
const blacklist: string[] = [];
```

## Good

```ts
const allowlist: string[] = [];
const denylist: string[] = [];
```

## Allowlist

```
lyse-disable a11y/inclusive-language
```

## Status

Stable and **scored**: it contributes to the Health Score.

## See also

- [Inclusive Naming Initiative](https://inclusivenaming.org/)
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
