# `versioning/deprecation-markers`

> **Axis:** AI surface · **Severity:** warning · **Auto-fixable:** no · **Version:** v1

Flags `@deprecated` JSDoc tags that carry no migration guidance, and signals AI-Consumable readiness (Face A).

## Why

A bare `@deprecated` tag tells a consumer that a symbol is going away but not what to use instead. A human can grep the changelog; a coding agent editing against the design system cannot reliably recover the migration target — it will either keep using the deprecated symbol or guess. A `@deprecated` tag that carries a replacement pointer (an inline description, a `@see` sibling, or an inline `{@link}`) is machine-readable migration guidance an agent can act on.

The check is deliberately **structural, not semantic**: it only asks whether *some* guidance accompanies the tag, never whether the prose is correct. Detecting deprecation intent in free prose (without the structured tag) is irreducibly heuristic and is out of scope for this deterministic rule — that signal belongs to the LLM-graded layer. Because this is a pure structural check, synthetic precision equals real precision.

## Self-gating

A design system with no `@deprecated` tags records **zero opportunities** and the rule is N/A (excluded from the score). The rule never penalizes a system for not having deprecations — it only grades the quality of the deprecations that exist.

## Where the rule looks

Every `@deprecated` tag at JSDoc-tag position (line start, after the comment border `*`) inside a block comment (`/* … */`) in a parsed TypeScript/JavaScript file. A `@deprecated` mentioned mid-sentence in prose ("replaces the @deprecated helper") is not a tag and is ignored.

A tag is **compliant** when any of these accompany it:

- an inline description: `@deprecated Use NewButton instead.`
- a wrapped (next-line) description before the next tag,
- a sibling `@see` tag with a target,
- an inline `{@link …}` anywhere in the comment.

## Bad

```ts
/** @deprecated */
export const OldButton = () => null;
```

## Good

```ts
/** @deprecated Use {@link NewButton} instead. */
export const OldButton = () => null;
```

```ts
/**
 * @deprecated
 * @see NewButton
 */
export const OldButton = () => null;
```

## What the rule checks

| Severity | Condition |
|---|---|
| `warning` | A `@deprecated` tag with no inline/wrapped description, no `@see` sibling, and no `{@link}` |
| (none) | Every `@deprecated` tag carries migration guidance — rule emits nothing |

## Allowlist

To skip a specific deprecation, add the disable directive inside its comment block (the tag is then not counted as an opportunity):

```ts
/** @deprecated lyse-disable versioning/deprecation-markers */
export const OldButton = () => null;
```

## What does NOT trigger this rule

- A design system with no `@deprecated` tags (N/A).
- A `@deprecated` mention in prose that is not at JSDoc-tag position.
- `@deprecated` text appearing in a string literal rather than a comment.

## See also

- [`tokens/deprecated-token-usage`](./tokens-deprecated-token-usage.md) — the deterministic deprecation signal for *tokens* (`$deprecated`).
- [`versioning/changelog-present`](./versioning-changelog-present.md) — sibling versioning rule.
- [`versioning/migration-guide-present`](./versioning-migration-guide-present.md) — sibling versioning rule.
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
