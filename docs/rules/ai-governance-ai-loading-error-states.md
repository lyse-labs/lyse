# ai-governance/ai-loading-error-states

**Axis:** ai-governance | **Default severity:** warning | **Track:** 3.7

Detects whether an AI-surface design system ships (a) a named AI loading state carrying paired visible or accessible text, and (b) an AI-specific error state component. Each absent state type independently emits a `warning` when an AI marker surface exists. Both present emits `info`. No finding when the DS has no AI surface.

---

## 1. Why

AI-generating surfaces have two failure modes that generic DS rules cannot see:

**Loading states without context.** A bare, unlabelled spinner leaves users unable to distinguish "model is generating", "network is slow", and "it's stuck". AWS Cloudscape's generative-AI patterns mandate that every AI loading state carry named, visible text (e.g. "Generating response…") so users can judge whether to wait or cancel. A `<Spinner />` with no named wrapper and no status string violates this contract.

**Generic error boundaries.** An `ErrorBoundary` communicates nothing AI-specific. When a generation fails, users need to know the AI operation failed — not a generic 500 — and ideally what to do next. A component named `AIError` or `GenerationError` signals this intent at the design-system level.

This rule checks only **static presence**: do the components exist in the component surface? The behavioral recovery flow (retry orchestration, post-error navigation) is explicitly out of scope and tracked separately (#16).

---

## 2. How

The rule globs `**/*.{tsx,jsx,vue}`, ignoring `node_modules/`, `dist/`, `build/`, `.git/`, `.next/`, `out/`, and `coverage/`. It first checks whether an AI marker surface exists (using the `isAiMarkerName` vocabulary from `ai-governance/ai-marker-component-present`). If no AI surface is detected, no finding is emitted.

When an AI surface exists, two independent detectors run across all component files:

**Named loading-with-text detector.** Matches component names (case-insensitive, substring) against: `generating`, `thinking`, `ailoading`, `streamingindicator`, `loadingstate`, `aistatus`. Names that are unambiguously descriptive (`Generating`, `Thinking`, `StreamingIndicator`) satisfy the requirement by name alone. Generic-ish names (`AILoading`, `AIStatus`, `LoadingState`) additionally require a paired-text signal in the source: a `loadingText` prop reference, an `aria-label` attribute, or a visible AI-progress phrase such as "Please wait".

A bare generic spinner (`Spinner`, `LoadingSpinner`, `CircularProgress`) with no AI name match and no paired-text signal does **not** satisfy this requirement and produces a `warning`.

**AI-specific error detector.** Matches component names (case-insensitive, substring) against direct patterns: `aierror`, `generationerror`, `aifailure`, `airetry`, `generationfailed`, `aitimeout`. Also matches any compound name that combines an AI keyword (`ai`, `generation`, `genai`, `llm`, `generative`) with an error keyword (`error`, `failure`, `failed`, `timeout`, `retry`).

A generic `ErrorBoundary` with no AI keyword in the name does **not** satisfy this requirement.

**Severity cross-conditions:**
- Both present → `info` (DS is provisioned for AI-state handling)
- Loading absent, error present → `warning`
- Error absent, loading present → `warning`
- Both absent → two `warning` findings
- No AI surface → no finding, `opportunities: 0`

Findings are sorted deterministically: `warning` before `info`, then alphabetically by message.

---

## 3. Examples

### Good — named loading state with visible text

```tsx
// Generating.tsx
export const Generating = () => (
  <div role="status" aria-live="polite">
    <Spinner /> Generating response…
  </div>
);
```

```tsx
// AILoading.tsx — loadingText prop satisfies the paired-text requirement
export function AILoading({ loadingText }: { loadingText: string }) {
  return (
    <div>
      <Spinner />
      <span>{loadingText}</span>
    </div>
  );
}
```

### Bad — bare spinner, no AI name, no paired text

```tsx
// LoadingSpinner.tsx — no AI name, no status text
export const LoadingSpinner = () => <svg className="spin" />;
```

### Good — AI-specific error state

```tsx
// AIError.tsx
export const AIError = ({ message }: { message: string }) => (
  <div role="alert">
    <strong>Generation failed</strong>
    <p>{message}</p>
  </div>
);
```

```tsx
// GenerationError.tsx
export const GenerationError = () => (
  <div>Unable to generate a response. Please try again.</div>
);
```

### Bad — generic error boundary, no AI context

```tsx
// ErrorBoundary.tsx — gives no AI-specific context
export class ErrorBoundary extends React.Component {
  render() {
    return this.props.children;
  }
}
```

---

## 4. Auto-fix

None. Named loading states and AI-specific error components require deliberate design decisions — component naming, copy, and accessibility roles cannot be automated safely. Design and implement these components manually following the guidance above.

---

## 5. Allowlist

To disable this rule for a repository, add the following directive to one of the checked files (`README.md`, `README.mdx`, `.lyse.yaml`, or `.lyse.yml`) at the repo root:

```
lyse-disable ai-governance/ai-loading-error-states
```

This completely suppresses all findings for the rule in that repo. Use this for repos that intentionally delegate loading and error state handling to a consuming application layer rather than shipping these components in the DS itself.

---

## 6. See also

- AWS Cloudscape Design System — Generative AI patterns (plain text reference; search "Cloudscape generative AI loading" for current guidance on named loading states and paired text requirements)
- #16 — behavioral recovery-flow detection (retry orchestration, post-error navigation). This is the planned successor rule; the present rule covers only static presence.
- `ai-governance/ai-marker-component-present` — establishes the AI marker surface (`AILabel`, `AIBadge`, `magic-*` etc.) that this rule uses as its trigger condition. The loading/error states rule fires only when that AI surface is detected.
