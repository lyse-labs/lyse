# recovery-flow-wired

Fixture demonstrating a compliant recovery flow for the `recovery-flow-behavioral` rubric dimension.

The static rule `ai-governance/ai-loading-error-states` (Track 3.7) PASSES here as well.
The `recovery-flow-behavioral` dimension should also find NO violation because:

- `AIError.tsx` accepts an `onRetry` prop (a callback) wired to the retry button's `onClick`.
- It accepts a `fallbackContent` prop for graceful degradation (shows previous output if available).
- The user is never left at a dead end: they can retry or see cached content.

Expected grader outcome for `recovery-flow-behavioral`: no findings emitted.
