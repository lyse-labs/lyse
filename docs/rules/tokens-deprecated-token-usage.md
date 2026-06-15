# `tokens/deprecated-token-usage`

> **Axis:** Tokens · **Severity:** warning · **Auto-fixable:** no · **Version:** v1

Flags any DTCG token whose `$value` aliases a token marked `$deprecated`.

## Why

The W3C Design Tokens (DTCG) draft supports `$deprecated` (a boolean, or a string reason) to mark a token as on its way out. The contract is that consumers stop referencing it. When another token *aliases* a deprecated token, the deprecation is defeated: every consumer of the aliasing token transitively depends on the deprecated value, and an AI agent resolving the alias lands on deprecated state with no signal that it did.

This is a deterministic structural check — alias resolution and the `$deprecated` flag are unambiguous — so synthetic precision equals real precision, which is why it can contribute to the Health Score.

## Where the rule looks

All DTCG token files discoverable from the repo root (`**/*.tokens.json`, `tokens/**/*.json`), parsed into a single token address space so a **cross-file** alias to a deprecated token is caught.

## Bad

```json
// design.tokens.json
{
  "color": {
    "old":  { "$value": "#000000", "$type": "color", "$deprecated": true },
    "text": { "$value": "{color.old}", "$type": "color" }
  }
}
```

`color.text` aliases the deprecated `color.old` → warning.

## Good

```json
{
  "color": {
    "old":  { "$value": "#000000", "$type": "color", "$deprecated": "use color.ink" },
    "ink":  { "$value": "#111111", "$type": "color" },
    "text": { "$value": "{color.ink}", "$type": "color" }
  }
}
```

The deprecated token still exists (fine — it carries its replacement hint), but nothing aliases it.

## What the rule checks

| Severity | Condition |
|---|---|
| `warning` | A token's `$value` is an alias resolving to a token whose `$deprecated` is truthy |
| (none) | No deprecated tokens, or no token aliases a deprecated one |

`$deprecated: false` is treated as *not* deprecated. The rule emits one finding per offending alias.

## What does NOT trigger this rule

- A deprecated token that exists but is never aliased — that is correct deprecation hygiene.
- Token files matched by `excludePaths` in `.lyse.yaml`.
- Token files larger than 2 MB — skipped to avoid pathological cases.

## See also

- [`tokens/dtcg-conformance`](./tokens-dtcg-conformance.md) — validates the rest of the DTCG contract.
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
- [DTCG `$deprecated`](https://tr.designtokens.org/format/#deprecated) — the spec field this rule reads.
