# ai-governance/value-gate-doc-present

**Axis:** ai-governance | **Default severity:** warning | **Status:** experimental

## Why

Design systems that ship AI surfaces must document a structured go/no-go decision gate before shipping AI features. Without this, AI usage is ad-hoc, unauditable, and inconsistent across teams.

The ServiceNow "10-Q" value gate defines the pattern: a fixed checklist of questions (is AI the right tool? can a deterministic rule solve this? what is the fallback?) that must be answered before any AI feature lands. This rule checks that the DS documents such a gate — not that the answers are correct.

Without this governance doc, individual teams ship AI features without justification, governance debt accumulates, and there is no audit trail to answer "why is AI used here?"

## How

This rule only activates when the design system has an AI surface, detected by:

- `scanForMarkerComponents` (Track 3.2) — an AI-marker component (`AILabel`, `AIBadge`, `magic-*`, etc.) in the export surface or component files
- `detectReservedAiTokens` (Track 3.1) — reserved AI-marker design tokens in token sources

When an AI surface is detected, the rule scans candidate locations for a value-gate governance doc:

**Static candidates (checked first):**
- `AI_GOVERNANCE.md` at repo root
- `docs/ai-value-gate.md`
- `docs/ai-governance.md`
- `docs/ai-readiness.md`
- `docs/ai-checklist.md`
- `.lyse/ai-value-gate.md`

**Glob fallback:**
- `docs/**/ai-value-gate.md`
- `docs/**/ai-governance.md`
- `docs/**/ai-readiness.md`
- `docs/**/ai-checklist.md`
- `docs/ai/*.md`

A doc is considered valid (gate language present) if it contains at least one of:

- "is AI needed"
- "value gate" or "value-gate"
- "go/no-go"
- "should this (feature) be AI"
- "is AI the right tool"
- "ai-readiness" or "ai readiness"
- "why AI?"
- "deterministic rule ... instead of AI"

## Examples

**Good — `AI_GOVERNANCE.md` with gate language:**

```markdown
# AI Value Gate

## Is AI needed?
- [ ] Can a deterministic rule solve this instead?
- [ ] Does ML outperform a rule on this specific input distribution?
- [ ] What is the fallback if the model is unavailable?

Go/no-go: answer all three before shipping any AI feature.
```

**Bad — guidelines without a decision gate:**

```markdown
# AI Guidelines

Use `AILabel` on all AI-generated content surfaces.
Follow the design tokens from the `ai` namespace.
```

The second example is a doc about AI, but it does not force the question "is AI the right tool?" — it assumes the decision is already made.

**Doc present but no gate language — warning, not info:**

A doc named `AI_GOVERNANCE.md` that only contains component usage guidelines without any go/no-go framing still emits `warning`. Presence alone is not sufficient; the gate questions must be there.

## Auto-fix

None. Doc authoring is a human governance decision that requires deliberate answers, not generated boilerplate.

## Allowlist

To suppress this rule for a repo where the governance process is handled externally (e.g. a corporate governance system), add the following directive to `README.md`, `README.mdx`, `.lyse.yaml`, or `.lyse.yml`:

```
lyse-disable ai-governance/value-gate-doc-present
```

DSs with no AI surface (no AI-marker component and no reserved AI tokens) trigger no finding automatically — no allowlist entry needed.

## See also

- ServiceNow AI governance "10-Q" value-gate checklist (internal reference, plain text — not publicly linked)
- Track 3.1 `ai-governance/ai-tokens-reserved` — inventory of reserved AI-marker design tokens
- Track 3.2 `ai-governance/ai-marker-component-present` — detection of AI-marker components in the DS export surface
