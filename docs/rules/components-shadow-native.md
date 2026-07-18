# `components/no-native-shadows`

> **Axis:** Components · **Severity:** warning · **Auto-fixable:** yes · **Version:** v1

Flags native HTML elements used in a file that already imports from your design system's component module.

## Why

When `<Button>` exists in your component library but a developer writes `<button>`, the result is a button that lacks your DS's focus styles, loading state, sizing variants, and accessibility affordances. Over time these native elements accumulate, and the DS becomes a parallel universe to actual usage.

The rule only fires in files that **already import from the DS module** — that is the high-signal case: the team uses the DS in this file but bypassed it for this element. Files that don't touch the DS at all are skipped entirely.

## How it works

The rule reads the `componentsModule` from `.lyse.yaml`:

```yaml
designSystem:
  componentsModule: "@your-org/ui"
```

In every file that imports from that module, it flags these native elements using a fixed mapping:

| Native | Suggested component |
|---|---|
| `<button>` | `Button` |
| `<input>` | `Input` |
| `<select>` | `Select` |
| `<textarea>` | `Textarea` |
| `<a>` | `Link` |

The mapping is fixed in v1 — it does not inspect the module's actual exports, and it is not configurable.

## Bad

```tsx
import { Button } from "@your-org/ui";

function LoginForm() {
  return (
    <form>
      <input type="email" placeholder="email" />
      <button type="submit">Sign in</button>
      <a href="/forgot">Forgot password?</a>
    </form>
  );
}
```

## Good

```tsx
import { Button, Input, Link } from "@your-org/ui";

function LoginForm() {
  return (
    <form>
      <Input type="email" placeholder="email" />
      <Button type="submit">Sign in</Button>
      <Link href="/forgot">Forgot password?</Link>
    </form>
  );
}
```

## Auto-fix

Lyse emits a machine-applicable fix payload that rewrites the native element to its component equivalent, including the import statement at the top of the file. Lyse never writes source files itself — the payload is applied by your agent (via `lyse handoff`) or `git apply`.

## Allowlist

For valid native usage:

```tsx
// lyse-disable-next-line components/no-native-shadows
<button onClick={onLegacyHandler}>Old way</button>
```

For an entire file, use the block-comment form (line comments are not recognized for file-level suppression):

```ts
/* lyse-disable components/no-native-shadows */
```

## What does NOT trigger this rule

- Files that do not import from `componentsModule` (no shadowing signal).
- Repos with no `componentsModule` configured — the rule is silent.
- DS-self audits (`dsSelfMode`): a DS that implements `<Button>` necessarily writes `<button>` — that's its job.
- Polymorphic usage: a nearby `as="button"` / `as="a"` prop (e.g. `<Box as="button">`) exempts the match.
- Files matching `designSystem.excludePaths` in `.lyse.yaml`.

## See also

- [Health Score](../guide/health-score.md) — how rules combine into the final score.
- [Configuration](../guide/configuration.md) — `.lyse.yaml` reference.
