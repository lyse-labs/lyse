# ai-governance/feedback-control-present

**Axis:** ai-governance | **Severity:** warning | **Track:** 3.8

## Why

Users interacting with AI-generated content need a structured way to signal output quality. HAX G15 (IBM Human-AI Experience guidelines, Granular feedback) and the Google PAIR Feedback & Control guidebook require that AI-powered interfaces expose a feedback control — thumbs up/down, rating, or helpful/unhelpful — so users can communicate when AI output is wrong, harmful, or unhelpful.

Without a dedicated component in the design system, teams implement ad-hoc feedback controls with inconsistent UX, missing accessibility attributes, and no shared vocabulary for categorized negative feedback.

Categorized feedback (why was it bad?) provides richer model-improvement signal than binary thumbs alone. This rule rewards designs that expose a reason enum (inaccurate, unhelpful, offensive) by noting the categorized bonus in the info message.

Vendor guidance:
- Microsoft Fluent 2 AI design guidelines — feedback affordance on AI output
- Amazon Cloudscape AI components documentation — feedback encouraged
- Red Hat PatternFly AI component guidance — feedback recommended
- IBM HAX G15 — Granular feedback requirement
- Google PAIR Feedback and Control guidebook

## How it works

Detection is two-phase, gated on AI surface presence.

**Phase 0 — AI surface gate:** Uses `scanForAiMarkers` (exported by `ai-governance/explainability-affordance`). If no AI-marker component is found in the design system, the rule emits nothing.

**Phase 1 — Name-based scan:** Reads `src/index.ts` and component files (`**/*.{tsx,jsx,vue}`), checks exported identifiers and file base names against the feedback vocabulary (case-insensitive substring):

| Pattern | Example matches |
|---------|----------------|
| `feedback` | `AiFeedback`, `MessageFeedback`, `FeedbackPanel` |
| `thumbsup` | `ThumbsUp`, `AiThumbsUpButton` |
| `thumbsdown` | `ThumbsDown` |
| `rating` | `StarRating`, `RatingControl`, `AiRating` |
| `vote` | `VotePanel`, `UpvoteButton`, `ResponseVote` |
| `helpful` | `WasThisHelpful`, `HelpfulButton`, `NotHelpful` |

Names ending in `Icon` (case-insensitive) are excluded — icon primitives are not feedback controls.

**Phase 2 — Categorized bonus:** For each matched feedback component file, checks whether the source exposes a reason vocabulary word (any of: `inaccurate`, `unhelpful`, `offensive`, `tooLong`, `harmful`, `misleading`, `irrelevant`) alongside an enum object, union type, or options array. If so, the info message notes "(categorized reason enum detected)".

**Outcomes:**

- AI-marker present + feedback control found → `info` (notes if categorized; HAX G15 / PAIR Feedback cited)
- AI-marker present + no feedback control → `warning`
- No AI-marker → no finding

## Scope

Static "affordance present" slice. Does not verify the control appears at every AI-output render site — that behavioral detection is a planned follow-up rule.

## Examples

**Good — thumbs controls with AI marker:**

```ts
// src/index.ts
export { AILabel } from './ai-label';
export { ThumbsUp, ThumbsDown } from './thumbs';
```

**Good — categorized reason enum:**

```ts
// src/components/AiFeedback.tsx
export const AiFeedback = () => null;

export const FeedbackReason = {
  inaccurate: "inaccurate",
  unhelpful: "unhelpful",
  offensive: "offensive",
} as const;
```

**Bad — AI marker present, no feedback control:**

```ts
// src/index.ts
export { AILabel } from './ai-label';
export { Button } from './button';
// No ThumbsUp, Rating, Feedback, or Helpful component
// → warning: no feedback control detected (HAX G15 / PAIR Feedback)
```

**No finding — no AI surface:**

```ts
// src/index.ts
export { Button } from './button';
export { ThumbsUp } from './thumbs'; // no AI-marker component present
// → no finding: AI surface gate not triggered
```

## Auto-fix

None. Shipping a feedback control is a deliberate design decision.

## Allowlist

Per-repo disable in README or `.lyse.yaml`:

```
lyse-disable ai-governance/feedback-control-present
```

Or globally in `.lyse.yaml`:

```yaml
rules:
  ai-governance/feedback-control-present: off
```

## See also

- `ai-governance/ai-marker-component-present` — exports `AI_MARKER_NAMES` vocabulary reused by sibling rules.
- `ai-governance/explainability-affordance` — exports `scanForAiMarkers` reused as the AI-surface gate for this rule.
- Health Score — how rules combine into the final score.
- Vendor feedback guidance (plain text): Microsoft Fluent 2 AI design guidelines (feedback affordance); Amazon Cloudscape AI components documentation; Red Hat PatternFly AI component guidance; IBM HAX G15 (Granular feedback); Google PAIR Feedback and Control guidebook.
