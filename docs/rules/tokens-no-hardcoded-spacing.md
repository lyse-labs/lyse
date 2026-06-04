# `tokens/no-hardcoded-spacing`

> **Axis:** Tokens · **Severity:** warning · **Auto-fixable:** yes · **Version:** v1

Flags raw pixel values used for spacing (padding, margin, gap, width, height in small contexts) where a spacing token should be used.

## Why

Spacing tokens (`spacing.xs`, `spacing.sm`, `spacing.md`, ...) encode a deliberate rhythm. Hardcoded `padding: 14px` breaks that rhythm — a designer wouldn't have chosen 14, but a developer guessed.

The result over time: dozens of slightly-off paddings, none aligned to the system, all defensible individually, all wrong together.

## Where the rule looks

- JSX `style={{ padding: "14px" }}`.
- CSS / SCSS files: `padding: 14px;`, `margin: 7px 11px;`.
- styled-components / Emotion: `` styled.div`padding: 14px;` ``.
- Tailwind arbitrary values: `p-[14px]`, `mt-[7px]`.

## Bad

```tsx
function Card() {
  return (
    <div style={{ padding: "14px", marginBottom: "23px" }}>
      <h2 style={{ marginBottom: "9px" }}>Title</h2>
    </div>
  );
}
```

## Good

```tsx
import { spacing } from "@your-org/ui/tokens";

function Card() {
  return (
    <div style={{ padding: spacing.md, marginBottom: spacing.lg }}>
      <h2 style={{ marginBottom: spacing.sm }}>Title</h2>
    </div>
  );
}
```

Or in CSS using CSS variables:

```css
.card {
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
}
```

## Auto-fix

The codemod replaces the pixel value with the closest matching spacing token. Tolerance is configurable.

If your scale is `{ xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }`, then `padding: "14px"` snaps to `padding: spacing.md` (within tolerance), and `padding: "100px"` is left as a warning (out of tolerance, requires human decision).

## Allowlist

```tsx
// lyse-disable-next-line tokens/no-hardcoded-spacing
const hairlineOffset = "1px";  // pixel-perfect alignment with image
```

## What does NOT trigger this rule

- Values `0`, `0px`, `auto`, `100%`, `100vw`, `100vh`, `min-content`, `max-content`, `fit-content`.
- Border widths (`border: 1px solid`) — borders have their own scale, addressed in a future rule.
- Font sizes (`font-size: 14px`) — typography has its own scale, see future `tokens/no-hardcoded-font-size`.
- **CSS custom-property declarations** — values on the RHS of `--token-name: <value>;` are token *definitions*, not drift. Applies inside `:root`, `@theme {}` (Tailwind v4), `[data-theme=...]`, `@layer base {}`, and any scoped selector that declares custom properties.

## Configuration

```yaml
# .lyse.yaml
rules:
  tokens/no-hardcoded-spacing:
    severity: warning
    tolerance: 2      # px distance for token snap (default 2)
```

## Related rules

- [`tokens/no-hardcoded-color`](./tokens-no-hardcoded-color.md)

## See also

- [Health Score](../guide/health-score.md) — how rules combine into the final score.
- [Configuration](../guide/configuration.md) — `.lyse.yaml` reference.
