# recovery-flow-no-recovery

Fixture demonstrating the behavioral gap the `recovery-flow-behavioral` rubric dimension targets.

The static rule `ai-governance/ai-loading-error-states` (Track 3.7) PASSES here:
- `Generating.tsx` provides a named AI loading state with paired text.
- `AIError.tsx` provides an AI-specific error state.

However, the `recovery-flow-behavioral` dimension flags a violation because `AIError`
has **no retry affordance, no regenerate handler, and no fallback path wired to it**.
It is a dead-end error state: the user sees "Generation failed" with no way forward.

Expected grader outcome for `recovery-flow-behavioral`: findings emitted (dead-end error state).
