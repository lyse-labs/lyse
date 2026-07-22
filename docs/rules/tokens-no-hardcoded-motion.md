# `tokens/no-hardcoded-motion`

> **Axis:** Tokens · **Severity:** warning (`near` durations, `novel` easings) / info (`novel` durations) · **Auto-fixable:** no · **Status:** stable (scored)

Flags hardcoded transition/animation **durations** and custom **`cubic-bezier()` easing curves** that don't come from a motion token scale.

## Why

Inconsistent durations (`180ms` here, `240ms` there) and ad-hoc bezier curves make a system's motion feel incoherent and untunable. A small motion scale (`--duration-fast/base/slow`, `--easing-standard/emphasized`) makes timing a deliberate, shared decision.

## How

Scans CSS / CSS-in-JS for:

- **Durations** — `<n>s` / `<n>ms` in `transition-duration` / `animation-duration` longhands and in the `transition` / `animation` shorthand.
- **Easings** — custom `cubic-bezier(...)` curves.

Exempt: zero durations, `var(...)` references, and standard easing keywords (`ease`, `linear`, `ease-in-out`, …). When a motion token scale is loaded (`ctx.tokens.motion`, keys prefixed `duration/` / `easing/`), on-scale values are compliant (whitespace-insensitive); off-scale values are flagged.

## How the value is resolved

On a full `lyse audit`, every motion literal is resolved against the repo's own motion tokens, derived from the Design System Graph (Tailwind config, `*.tokens.json`, CSS custom properties, SCSS variables). This axis has **two halves**, and the resolver routes each literal by its own shape: a duration parses to a number of milliseconds and takes the numeric path, while an easing curve does not and falls to the composite path.

**Durations** behave like the other numeric axes. Values normalize to milliseconds, so `0.2s` and `200ms` compare equal; the 16px-root length normalization used by the length-valued axes is not involved.

| Class | Meaning | What this rule emits for a duration |
|---|---|---|
| `exact` | The value is on the repo's own duration scale | nothing — this is compliant usage, not drift |
| `near` | One scale step away from a duration token (needs at least two duration tokens — see below) | **warning**, confidence medium; the candidate token is named in the suggestion |
| `novel` | A real duration that resembles no token | **info**, confidence low |
| `unresolved` | Not judgeable statically (`var(--x)`, a SCSS `$var`, a CSS-wide keyword) | nothing — counted in the audit's `meta.abstentions` |

**`near` needs at least two tokens on the axis.** A one-token axis has no adjacent gap, so it has no observable step unit and "one step away" would be a manufactured number — every non-matching value on such an axis resolves `novel` instead. An exact hit on a one-token axis still resolves `exact`.

**Easings** are a composite axis: a bezier curve has no defensible single-scalar distance, so the comparison is normalized string equality (lowercased, whitespace-collapsed) and the `near` band is structurally unreachable.

| Class | Meaning | What this rule emits for an easing |
|---|---|---|
| `exact` | Normalized string match against an easing token | nothing — this is compliant usage, not drift |
| `near` | — | structurally unreachable on a composite axis |
| `novel` | No easing token matches | **warning** |
| `unresolved` | Not judgeable statically | nothing — counted in the audit's `meta.abstentions` |

A `novel` easing emits **warning**, not `info`. The `info` downgrade is only defensible where a `near` band exists to absorb the "one step off, probably a typo" case. With no `near` band on the easing half, `novel` collapses "a curve differing in one bezier parameter" and "a completely unrelated curve" into a single class; grading that whole class `info` would under-report the first, which is genuine drift and exactly what the pre-migration rule reported as `warning`.

**There is no fallback scale on this axis.** A repo with no motion tokens at all resolves every literal `novel` — durations then report at `info` rather than `warning`, which is a real behaviour change from before the migration; easings keep reporting at `warning`.

A `near` duration names its actual candidate token, which supersedes the generic remediation hint. Every other emitted case has no candidate to name and carries that fixed hint instead.

The resolver only exists on a full `lyse audit`. Single-file surfaces — MCP `audit_file`, IDE contexts, codemod contexts — have no repo-wide scale and keep the pre-migration behaviour: an exact-match token lookup and an unconditional `warning` for both halves.

## Bad

```css
.x { transition: all 0.24s cubic-bezier(0.1, 0.2, 0.3, 0.4); }
```

## Good

```css
:root { --duration-base: 200ms; --easing-standard: cubic-bezier(0.4, 0, 0.2, 1); }
.x { transition: all var(--duration-base) var(--easing-standard); }
```

## Allowlist

```
lyse-disable tokens/no-hardcoded-motion
```

## Status

Value-drift rule — **stable** and **scored**: it contributes to the Health Score.

## See also

- [Health Score](../guide/health-score.md)

## Reliability

<!-- reliability:auto:start -->
- near · app: not measured
- novel · app: not measured
<!-- reliability:auto:end -->
