# `stories/coverage`

> **Axis:** Stories · **Severity:** info · **Auto-fixable:** no · **Version:** v1

Flags components that don't have a corresponding Storybook story file.

> **Scope note.** This axis scores *coverage* — does each component have a story? It does **not** score the contents of story files. Hardcoded values inside `*.stories.*` (and `*.test.*`, `*.demo.*`, `*.example.*`) files are deliberately **not** flagged as token drift: demo/fixture literals are expected there, so the token rules skip them to avoid mass false positives. "Storybook detected" at `lyse init` therefore refers to this coverage check, not to drift-scanning inside stories.

## Why

A component without a story is a component without a contract. New contributors don't know how to use it, designers can't review it in isolation, visual regression tools can't snapshot it, and the component drifts because nobody's looking at it independently.

The story file isn't busywork — it's the canonical demonstration of the component's surface area.

## What counts as a component

By default, Lyse considers a file a component if:
- It's a `.tsx` or `.jsx` file.
- It exports at least one PascalCase named export OR a `default` export with a PascalCase name.
- It's not under an excluded path (`excludePaths` in `.lyse.yaml`).
- It's not itself a story file (`*.stories.*`).
- It's not a test file (`*.test.*`, `*.spec.*`).

## What counts as a story

A file co-located with the component, named `<Component>.stories.{ts,tsx,mdx,js,jsx}`.

```
src/components/Button/
├── Button.tsx
├── Button.stories.tsx       ✓ counts
└── Button.test.tsx
```

Or under a parallel `stories/` directory:

```
src/components/Button.tsx
src/stories/Button.stories.tsx   ✓ counts (path-matched by basename)
```

## Bad

```
packages/ui/src/
├── Button.tsx                ⚠ no story → reported
├── Card.tsx                  ⚠ no story → reported
└── Avatar/
    ├── Avatar.tsx            ⚠ no story → reported
    └── index.ts
```

## Good

```
packages/ui/src/
├── Button.tsx
├── Button.stories.tsx
├── Card.tsx
├── Card.stories.tsx
└── Avatar/
    ├── Avatar.tsx
    ├── Avatar.stories.tsx
    └── index.ts
```

## No auto-fix

Generating a story file automatically is technically possible but rarely useful — the auto-generated story would be a single empty render, which is worse than no story (people assume coverage exists).

If you want a quick way to scaffold stories, your IDE's "new file from template" is the right tool, not Lyse.

## Allowlist

For files that are technically components but shouldn't have stories (internal helpers, pure functions wrapped in React.memo, providers, error boundaries):

```tsx
// lyse-disable stories/coverage
//
// This component is internal-only and is exercised by ButtonGroup's stories.
export function ButtonGroupItem({ children }: Props) { ... }
```

Or globally in `.lyse.yaml`:

```yaml
designSystem:
  excludePaths:
    - "**/internal/**"
    - "**/providers/**"
```

## What does NOT trigger this rule

- Files matching `excludePaths`.
- Files starting with `_` (convention: private).
- Files that don't export a PascalCase symbol.
- Files in routes / pages directories (Next.js `app/`, `pages/`, Remix `routes/`) — these are screens, not components.

## Configuration

```yaml
# .lyse.yaml
rules:
  stories/coverage:
    severity: info
    componentPaths:
      - "packages/ui/src/**/*.{tsx,jsx}"
    storyExtensions:
      - "stories.tsx"
      - "stories.mdx"
```

## What if you don't use Storybook?

Several alternatives provide the same value (Histoire, Ladle, Pony, custom in-house docs). If you use one of these, the axis is currently scored as if you had no stories at all (low score) — which is a known limitation.

A future version will auto-detect alternative documentation tools and mark this axis as N/A in their presence. For v0.1.0 the workaround is to disable the rule:

```yaml
rules:
  stories/coverage: off
```

When disabled, the `stories` axis is treated as N/A and the weight redistributes.

## See also

- [Health Score](../guide/health-score.md) — how rules combine into the final score.
- [Configuration](../guide/configuration.md) — `.lyse.yaml` reference.
