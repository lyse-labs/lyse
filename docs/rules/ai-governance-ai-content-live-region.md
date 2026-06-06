# ai-governance/ai-content-live-region

## Why it matters

Screen-reader users rely on ARIA live regions to hear dynamically updated content.
When an AI model streams a response token-by-token, the DOM updates silently unless
the container carries `aria-live="polite"`, `role="status"`, `role="alert"`, or an
equivalent framework mechanism. Without a live region, visually impaired users miss
the entire AI response — a failure of both accessibility and AI-governance (the
system produces output that some users cannot perceive).

WAI-ARIA specifies that `aria-live="polite"` announces changes after the user is
idle (appropriate for non-urgent AI output); `aria-live="assertive"` / `role="alert"`
interrupt immediately (use only for errors). PatternFly provides `isLiveRegion` as
a prop on several container components to avoid hand-rolling the attribute.

This rule checks the static presence of a live-region mechanism in the same file
as an AI-output or streaming component — it does not verify runtime behaviour or
dynamic DOM updates.

## How it works

Lyse globs `**/*.{tsx,jsx,vue}` and for each file runs two detectors:

1. **AI output surface** — the file contains a component whose usage matches any of:
   - An AI marker from the shared vocabulary (`AI_MARKER_NAMES`, `isAiMarkerName`):
     `AILabel`, `AIBadge`, `AITag`, `AIIndicator`, `AIMarker`, `AIAvatar`,
     `GenAIAvatar`, `GenAIBadge`, `GenAILabel`, `GenAITag`, Polaris `magic-*`.
   - A component name matching `*AIResponse*` or `*ChatMessage*`.
   - A JSX/Vue prop `isStreaming` or `isGenerating` (streaming indicators).
2. **Live region** — the same file contains one of:
   - `aria-live="polite"` or `aria-live="assertive"`.
   - `role="status"` or `role="alert"`.
   - `isLiveRegion` prop (PatternFly).

Cross-condition:
- AI surface present, live region **absent** → `warning`.
- AI surface present, live region **present** → `info` (notes the mechanism).
- No AI surface → no finding, `opportunities: 0`.

## Examples

**Good — aria-live wraps AI output (React)**

```tsx
export function AiAnswer({ content }: { content: string }) {
  return (
    <div aria-live="polite">
      <AILabel>AI</AILabel>
      <p>{content}</p>
    </div>
  );
}
```

**Bad — AI output with no live region**

```tsx
export function AiAnswer({ content }: { content: string }) {
  return (
    <div className="response">
      <ChatAIResponse content={content} />
    </div>
  );
}
```

**Good — role="status" on a streaming panel**

```tsx
export function StreamPanel({ isStreaming }: { isStreaming: boolean }) {
  return <div role="status">{isStreaming ? <Spinner /> : answer}</div>;
}
```

**Good — PatternFly isLiveRegion**

```tsx
<TextContent isLiveRegion>{streamedContent}</TextContent>
```

**Good — Vue SFC with aria-live**

```vue
<template>
  <section aria-live="polite">
    <AILabel>AI</AILabel>
    <p>{{ response }}</p>
  </section>
</template>
```

## Auto-fix

No auto-fix. Adding a live region requires understanding the parent container
structure and the urgency of the AI content — mechanical insertion risks
wrapping the wrong element or using an incorrect `aria-live` value.

## Allowlist

Add to your `README.md` or `.lyse.yaml`:

```
lyse-disable ai-governance/ai-content-live-region
```

Use when:
- The DS intentionally defers live-region wiring to consuming applications.
- A custom ARIA live-region pattern is used that Lyse does not yet recognise.

## See also

- WAI-ARIA Authoring Practices — Live Regions (W3C specification)
- PatternFly — isLiveRegion prop (PatternFly component documentation)
- WCAG 2.1 SC 4.1.3 — Status Messages (Level AA)
- ai-governance/ai-marker-component-present — Track 3.2
- ai-governance/explainability-affordance — Track 3.5
