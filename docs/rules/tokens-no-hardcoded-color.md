# `tokens/no-hardcoded-color`

> **Axis:** Tokens · **Severity:** warning (`exact`/`near`) / info (`novel`) · **Auto-fixable:** yes · **Version:** v1

Flags color literals (hex, `rgb()`, `rgba()`, `hsl()`, `hsla()`) used in UI code where a design token should be used instead.

## Why

Hardcoded colors are the #1 source of design system drift. They survive theme changes, dark mode toggles, brand refreshes, and accessibility audits — silently producing the wrong color.

A healthy design system surfaces color decisions as named tokens. Once tokens exist, hardcoded colors become drift.

## Where the rule looks

- JSX `style={{ color: "#ff0000" }}` attributes.
- CSS files (`.css`, `.scss`, `.module.css`): `color: #ff0000;`, `background: rgb(255, 0, 0);`.
- styled-components / Emotion template literals: `` styled.div`color: #ff0000;` ``.
- Tailwind arbitrary values: `text-[#ff0000]`.

## How the value is resolved

On a full `lyse audit`, every colour literal is resolved against the repo's own colour tokens, derived from the Design System Graph (Tailwind config, `*.tokens.json`, CSS custom properties, SCSS variables). Both sides are parsed into OKLab, so `#3B82F6`, `rgb(59, 130, 246)` and a `#3b82f6` token are the same colour. The comparison places the literal in exactly one of four classes:

| Class | Meaning | What this rule emits |
|---|---|---|
| `exact` | Perceptually identical to a token (ΔEOK = 0) — the literal **is** the token, written out by hand | **warning**, confidence high, plus a single safe auto-fix: the candidate token is named in `fixGroup.to` |
| `near` | Within the perceptual tolerance (ΔEOK ≤ 0.02) but not identical | **warning**, confidence medium; the candidate token is named in the suggestion but never auto-applied |
| `novel` | A real colour that resembles no token on this axis | **info**, confidence low — the colour is reported, but Lyse does not claim it is drift |
| `unresolved` | The parser did not understand the syntax | collapses to `novel` on this axis |

The `unresolved` → `novel` collapse is specific to colours. Every genuinely opaque case — `var()` references, `currentColor` and the other allowlist keywords, non-literal function arguments, custom-property declarations in token-def scopes — is already filtered out before the resolver is consulted, so an `unresolved` here can only mean "the parser has yet to learn this syntax". Silencing it would drop real drift. On the numeric and composite axes, abstention is legitimate and `unresolved` keeps meaning "emit nothing" (counted in the audit's `meta.abstentions`).

The colour parser understands `#rgb` / `#rgba` / `#rrggbb` / `#rrggbbaa`, named colours, `rgb()` / `hsl()` in both CSS Color Level 3 comma-separated form and CSS Color Level 4 space-separated form (`rgb(R G B)`, `hsl(H S% L%)` — the canonical shadcn/ui and Tailwind v4 theme form), and `oklch()` / `oklab()`.

The resolver only exists on a full `lyse audit`. Single-file surfaces — MCP `audit_file`, IDE contexts, codemod contexts — have no repo-wide scale and keep the pre-migration behaviour: an exact-match token lookup and an unconditional `warning`.

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

An auto-fix is only ever proposed for an `exact` resolution — the one case where the replacement is safe, because the literal and the token are the same colour. `near` and `novel` findings still carry a `fixGroup` (so the drift class is grouped and countable), but never a replacement to apply: a `near` names its candidate token in the suggestion for a human or an agent to confirm, and a `novel` has no candidate to name.

Run via the MCP server: `suggest_fix(path, "tokens/no-hardcoded-color", line)` returns a unified diff you can apply.

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
```

The perceptual tolerance that separates `near` from `novel` (ΔEOK ≤ 0.02) is a fixed resolver constant, not a per-rule option.

## What does NOT trigger this rule

- `transparent`, `currentColor`, `inherit`, `initial`, `unset` — these are intentional escape hatches.
- **Test / spec / story / fixture files** — `*.test.*`, `*.spec.*`, `*.stories.*`, `*.fixture.*`, `__tests__/**`, `__mocks__/**`, `**/fixtures/**`. Color literals in these roles are assertion artefacts or documentation, not UI drift.
- **Schema / data / config / type-declaration files** — `*.dto.*`, `*.input.*`, `*.schema.*`, `*.entity.*`, `*.config.*`, `*.d.ts`, and files under `dto/` or `schemas/`. For example, a NestJS `@ApiProperty({ example: "#FFFFFF" })` is schema documentation.
- **Color token-definition files** — files whose job is to define the color palette are the source of truth, not drift:
  - `colors.ts`, `colors.css`, `colors.scss` (top-level or nested)
  - `*-colors.ts` / `*-colors.js` (e.g. `brand-colors.ts`, `legacy-colors.ts`)
  - `_legacy-colors.ts` / `_legacy-colors.js`
  - `palette.ts`, `palette.css`, `palette.scss`
  - `*.colors.ts`, `*.colors.css`, `*.colors.scss` (e.g. `button.colors.ts`)
- **Demo and story stylesheet files** — files under `demos/`, `*.demo.{ts,tsx,js,jsx}`, and CSS/SCSS files anywhere under `stories/` directories are for documentation/showcase.
- **`example:` / `default:` / `placeholder:` / `sample:` / `mock:` object key values** — color literals that are the value of one of these keys are treated as documentation/mock data, not drift.
- **JSDoc `@example` blocks** — color literals inside `/** … @example … */` comments are documentation.
- **CSS custom-property declarations in token-def scopes** — values on the RHS of `--token-name: <value>;` inside `:root`, `html`, `:host`, `*`, `[data-theme…]`, `@theme {}`, or `@layer base {}` are token *definitions*, not drift. A custom property in a component selector (`.widget { --local-bg: #fff }`) still fires — that is drift.
- Color literals inside `var()` fallback arguments (`var(--token, #fff)`) — the fallback is a safe defensive value, not drift.

## Reliability

| Metric | Value |
|---|---|
| Status | experimental |
| Contributes to Health Score | no |
| Real-world precision | ~65% (8 OSS repos, 1256 findings) |
| Precision on medium-confidence findings | ~88.9% |
| Recall | ~100% |

Color literals are pervasive in legitimate code (token-definition files, documentation, var() fallbacks, schema examples, test fixtures). The rule guards against the most common false-positive patterns via path guards and syntactic exemptions, but the lexical ceiling for precision is ~85–88% — not the 90% Wilson lower bound required for promotion to the Health Score. The `confidence` field on findings measures fix-confidence (how certain the codemod is about the replacement), not drift-confidence (whether the literal is genuine drift vs. a legitimate use). These are distinct axes; improving fix-confidence does not raise drift precision.

**90%-scored is not honestly reachable** with the current lexical detection strategy. Promotion would require either (a) AST-level context (knowing whether a color literal is inside a UI render path vs. a non-UI scope) or (b) an LLM precision filter. Neither is in scope for this rule today.

Use the `confidence: medium` filter in the handoff payload to see only findings where the rule has higher signal.

### Per-class precision (measured)

Colour is the only token axis where `exact` (a literal identical to an existing
token) is treated as drift; every numeric axis treats `exact` as on-scale =
compliant. The line below is auto-generated from the checked-in
[`rules-precision.json`](../../packages/core/rules-precision.json) ledger, whose
`exact` bucket is verified deterministically (no LLM) and is the only
gate-eligible class. `near`/`novel`/`unresolved` are LLM-judge candidates and
are not measured here.

<!-- reliability:auto:start -->
- exact · app: measured 50.0% · N=84 · deterministic
- near · app: not measured
- novel · app: not measured
- unresolved · app: not measured
<!-- reliability:auto:end -->

## Related rules

- [`tokens/no-hardcoded-spacing`](./tokens-no-hardcoded-spacing.md)

## See also

- [Health Score](../guide/health-score.md) — how rules combine into the final score.
- [Configuration](../guide/configuration.md) — `.lyse.yaml` reference.
- [Contributing](../../CONTRIBUTING.md) — how to add or refine rules.
