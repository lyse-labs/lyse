# `tokens/no-hardcoded-spacing`

> **Axis:** Tokens · **Severity:** warning (`near`) / info (`novel`) · **Auto-fixable:** yes · **Version:** v1

Flags raw pixel values used for spacing (padding, margin, gap, width, height in small contexts) where a spacing token should be used.

## Why

Spacing tokens (`spacing.xs`, `spacing.sm`, `spacing.md`, ...) encode a deliberate rhythm. Hardcoded `padding: 14px` breaks that rhythm — a designer wouldn't have chosen 14, but a developer guessed.

The result over time: dozens of slightly-off paddings, none aligned to the system, all defensible individually, all wrong together.

## Where the rule looks

- JSX `style={{ padding: "14px" }}`.
- CSS / SCSS files: `padding: 14px;`, `margin: 7px 11px;`.
- styled-components / Emotion: `` styled.div`padding: 14px;` ``.
- Tailwind arbitrary values: `p-[14px]`, `mt-[7px]`.

## How the value is resolved

On a full `lyse audit`, every spacing literal is resolved against the repo's own spacing scale, derived from the Design System Graph (Tailwind config, `*.tokens.json`, CSS custom properties, SCSS variables). The resolution places the value in exactly one of four classes:

| Class | Meaning | What this rule emits |
|---|---|---|
| `exact` | The value is on the repo's own scale | nothing — this is compliant usage, not drift |
| `near` | One scale step away from a token | **warning**, confidence medium; the candidate token is named in the suggestion |
| `novel` | A real value that resembles no token on this axis | **info**, confidence low |
| `unresolved` | Not judgeable statically (`var(--x)`, a SCSS `$var`, a CSS-wide keyword) | nothing — counted in the audit's `meta.abstentions` |

Note that `exact` here means the opposite of what it means on the colour axis: a spacing value identical to a token is a value *on the scale*, so it is silence, not a finding.

Lengths normalize to px assuming a **16px root** (`rem` / `em` × 16), so a literal written in px compares correctly against a scale authored in rem and vice versa. A repo that overrides the root font size sees advisory `near` / `novel`, never a false `exact`.

**Fallback scale.** Spacing is the only axis with a built-in fallback. A repo with no spacing tokens at all falls back to the default 34-step Tailwind px scale, so those 34 steps resolve `exact` and stay silent. Before the migration, such a repo had every spacing literal flagged. On the fallback scale `exact` and `near` carry no candidate token — the scale knows the answer but no token anchors it — so no suggestion is offered.

The resolver only exists on a full `lyse audit`. Single-file surfaces — MCP `audit_file`, IDE contexts, codemod contexts — have no repo-wide scale (and no fallback) and keep the pre-migration behaviour: an exact-match token lookup and an unconditional `warning`.

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

The codemod (`suggest_fix` via the MCP server) replaces the pixel value only when it maps to exactly one token by exact value match — there is no snapping to a nearby token and no distance tolerance. If your scale is `{ xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }`, then `padding: "16px"` is rewritten to the `md` token, `padding: "14px"` is not rewritten (no token has that value), and a value that maps to several tokens is returned as alternatives for a human to pick.

On the audit path, a `near` finding names its candidate token in the suggestion, but never carries a replacement to apply: only an on-scale (`exact`) match is a safe automatic rewrite, and those are not emitted as findings.

## Allowlist

```tsx
// lyse-disable-next-line tokens/no-hardcoded-spacing
const hairlineOffset = "1px";  // pixel-perfect alignment with image
```

## What does NOT trigger this rule

- Values `0`, `0px`, `auto`, `100%`, `100vw`, `100vh`, `min-content`, `max-content`, `fit-content`.
- **Non-spacing CSS properties** — the rule is property-aware and only fires when the px/rem/em value is in a spacing context. The following properties are intentionally excluded:
  - `font-size`, `line-height` — typography scale (separate future rule).
  - `border-radius` — radius scale (separate future rule).
  - `border-width` / shorthand `border: 1px solid` — border-width scale.
  - `width`, `height`, `min-width`, `max-width`, `min-height`, `max-height` — layout/sizing.
  - `transform: translateX()`, `translateY()` — animation/motion.
  - `@media (max-width: …)`, `useMediaQuery("…")`, `matchMedia("…")` — breakpoints.
- **Non-spacing Tailwind arbitrary prefixes** — `text-[28px]` (font-size), `leading-[…]` (line-height), `rounded-[10px]` (border-radius), `w-[…]`, `h-[…]`, `max-w-[…]`, `size-[…]`, `translate-[…]` do not fire. Only spacing prefixes fire: `p-`, `px-`, `py-`, `pt-`, `pr-`, `pb-`, `pl-`, `m-`, `mx-`, `my-`, `mt-`, `mr-`, `mb-`, `ml-`, `gap-`, `gap-x-`, `gap-y-`, `space-x-`, `space-y-`, `inset-`, `top-`, `right-`, `bottom-`, `left-`.
- **`1px`** — allowed when it appears in a border-width context (`border: 1px solid`). In a spacing context (`padding: 1px`, `p-[1px]`) it still fires — 1px padding is drift.
- **Test / spec / story / fixture files** — `*.test.*`, `*.spec.*`, `*.stories.*`, `*.fixture.*`, `__tests__/**`, `__mocks__/**`, `**/fixtures/**`. Spacing literals in these roles are assertion artefacts or documentation, not UI drift.
- **Schema / data / config / type-declaration files** — `*.dto.*`, `*.input.*`, `*.schema.*`, `*.entity.*`, `*.config.*`, `*.d.ts`, and files under `dto/` or `schemas/`. Spacing literals in config or schema files are not DS violations.
- **`example:` / `default:` / `placeholder:` / `sample:` / `mock:` object key values** — spacing literals that are the value of one of these keys are documentation/mock data.
- **JSDoc `@example` blocks** — spacing literals inside `/** … @example … */` comments are documentation.
- **CSS custom-property declarations in token-def scopes** — values on the RHS of `--token-name: <value>;` inside `:root`, `html`, `:host`, `*`, `[data-theme…]`, `@theme {}`, or `@layer base {}` are token *definitions*, not drift. A custom property in a component selector (`.widget { --local: 7px }`) still fires — that is drift.

## Configuration

```yaml
# .lyse.yaml
rules:
  tokens/no-hardcoded-spacing:
    severity: warning
```

The `near` band is one step of the repo's own scale, a fixed resolver constant — there is no per-rule distance option.

## Related rules

- [`tokens/no-hardcoded-color`](./tokens-no-hardcoded-color.md)

## See also

- [Health Score](../guide/health-score.md) — how rules combine into the final score.
- [Configuration](../guide/configuration.md) — `.lyse.yaml` reference.
