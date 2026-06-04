# `components/no-native-shadows`

> **Axis:** Components · **Severity:** warning · **Auto-fixable:** yes · **Version:** v1

Flags native HTML elements used where a design system component would be more appropriate.

## Why

When `<Button>` exists in your component library but a developer writes `<button>`, the result is a button that lacks your DS's focus styles, loading state, sizing variants, and accessibility affordances. Over time these native elements accumulate, and the DS becomes a parallel universe to actual usage.

This rule flags native elements that shadow a component you've already built.

## How it knows which components exist

The rule reads the `componentsModule` from `.lyse.yaml`:

```yaml
designSystem:
  componentsModule: "@your-org/ui"
```

Lyse resolves the module, enumerates its named exports, and maps each export to a default native equivalent:

| Native | Component (heuristic) |
|---|---|
| `<button>` | `Button` |
| `<a>` | `Link` |
| `<input>` | `Input` |
| `<select>` | `Select` |
| `<textarea>` | `Textarea` |
| `<table>` | `Table` |
| `<img>` | `Image` |

You can override the mapping in config (see Configuration below).

## Bad

```tsx
// Project has @your-org/ui exporting Button, Input, Link

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

The codemod rewrites the native element to its component equivalent, including the import statement at the top of the file.

The codemod **preserves all attributes** — `onClick`, `disabled`, `aria-*`, `data-*`, `className`, `style` — and just changes the tag name and the import.

## Allowlist

For valid native usage (legacy code, third-party libraries, semantic HTML in MDX/blog posts):

```tsx
// lyse-disable-next-line components/no-native-shadows
<button onClick={onLegacyHandler}>Old way</button>
```

For an entire file:

```ts
// lyse-disable components/no-native-shadows
```

## What does NOT trigger this rule

- Native elements when the component is not exported from `componentsModule` (no shadowing).
- Native elements inside Storybook story files (fixtures).
- Native elements inside MDX / `.md` files (prose).
- Native elements inside an explicit `unsafe-html` boundary (component opt-out).

## Configuration

```yaml
# .lyse.yaml
designSystem:
  componentsModule: "@your-org/ui"
  componentMap:
    "button": "Button"        # override default mapping
    "a": "Link"
    "select": "Combobox"      # use Combobox instead of default Select
```

## See also

- [Health Score](../guide/health-score.md) — how rules combine into the final score.
- [Configuration](../guide/configuration.md) — `.lyse.yaml` reference.
