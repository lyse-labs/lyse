# `tokens/no-hardcoded-color`

> **Axis:** Tokens · **Severity:** warning · **Auto-fixable:** yes · **Version:** v1

Flags color literals (hex, `rgb()`, `rgba()`, `hsl()`, `hsla()`) used in UI code where a design token should be used instead.

## Why

Hardcoded colors are the #1 source of design system drift. They survive theme changes, dark mode toggles, brand refreshes, and accessibility audits — silently producing the wrong color.

A healthy design system surfaces color decisions as named tokens. Once tokens exist, hardcoded colors become drift.

## Where the rule looks

- JSX `style={{ color: "#ff0000" }}` attributes.
- CSS files (`.css`, `.scss`, `.module.css`): `color: #ff0000;`, `background: rgb(255, 0, 0);`.
- styled-components / Emotion template literals: `` styled.div`color: #ff0000;` ``.
- Tailwind arbitrary values: `text-[#ff0000]`.

## Bad

```tsx
function Banner() {
  return (
    <div style={{ background: "#3B82F6", color: "rgb(255, 255, 255)" }}>
      Hello
    </div>
  );
}
```

```css
.banner {
  background: hsl(217, 91%, 60%);
  color: #fff;
}
```

## Good

```tsx
import { tokens } from "@your-org/ui/tokens";

function Banner() {
  return (
    <div style={{ background: tokens.color.brandPrimary, color: tokens.color.white }}>
      Hello
    </div>
  );
}
```

```css
.banner {
  background: var(--color-brand-primary);
  color: var(--color-white);
}
```

## Auto-fix

The codemod replaces hex / rgb / hsl literals with the closest matching token from your `tokens` module.

Run via the MCP server: `suggest_fix(path, "tokens/no-hardcoded-color", line)` returns a unified diff you can apply.

The codemod is conservative: if no token matches within a small color distance, it leaves the literal in place and emits a warning instead of a fix.

## Allowlist

For genuinely arbitrary colors (data viz, dynamic chart fills, brand-specific exceptions):

```tsx
// lyse-disable-next-line tokens/no-hardcoded-color
const heatmapColor = `rgb(${red}, 0, 0)`;
```

For a whole file:

```ts
// lyse-disable tokens/no-hardcoded-color
```

## Configuration

```yaml
# .lyse.yaml
rules:
  tokens/no-hardcoded-color:
    severity: warning
    tolerance: 5      # color-distance threshold for token matching (default 5)
```

## What does NOT trigger this rule

- `transparent`, `currentColor`, `inherit`, `initial`, `unset` — these are intentional escape hatches.
- **Test / spec / story / fixture files** — `*.test.*`, `*.spec.*`, `*.stories.*`, `*.fixture.*`, `__tests__/**`, `__mocks__/**`, `**/fixtures/**`. Color literals in these roles are assertion artefacts or documentation, not UI drift.
- **Schema / data / config / type-declaration files** — `*.dto.*`, `*.input.*`, `*.schema.*`, `*.entity.*`, `*.config.*`, `*.d.ts`, and files under `dto/` or `schemas/`. For example, a NestJS `@ApiProperty({ example: "#FFFFFF" })` is schema documentation.
- **`example:` / `default:` / `placeholder:` / `sample:` / `mock:` object key values** — color literals that are the value of one of these keys are treated as documentation/mock data, not drift.
- **JSDoc `@example` blocks** — color literals inside `/** … @example … */` comments are documentation.
- **CSS custom-property declarations** — values on the RHS of `--token-name: <value>;` are token *definitions*, not drift. The guard is property-name-based, so it applies inside `:root`, `@theme {}` (Tailwind v4), `[data-theme="dark"] {}`, `@layer base {}`, and any scoped selector that declares custom properties.
- Color literals inside `var()` fallback arguments (`var(--token, #fff)`) — the fallback is a safe defensive value, not drift.

## Related rules

- [`tokens/no-hardcoded-spacing`](./tokens-no-hardcoded-spacing.md)

## See also

- [Health Score](../guide/health-score.md) — how rules combine into the final score.
- [Configuration](../guide/configuration.md) — `.lyse.yaml` reference.
- [Contributing](../../CONTRIBUTING.md) — how to add or refine rules.
