# ai-governance/interaction-pattern-docs

**Axis:** ai-governance | **Severity:** warning | **Track:** 9.9

## Why

A design system that ships AI features but never documents *how* its AI interaction patterns behave leaves product teams to reinvent — inconsistently — when and how the AI suggests, generates, asks for authorization, hands off to a human, regenerates, or exposes history. The Kavcic AI-design maturity model and IBM HAX guidelines treat documented, reusable interaction patterns as a core governance signal: the difference between an AI design system and a pile of AI components.

## How it works

Gated on AI-surface presence (an AI-marker component). The rule scans markdown (`**/*.{md,mdx}`) and counts the six Kavcic/HAX interaction-pattern types that appear as a `#` heading — but only in **AI-context docs** (path or content references ai / assistant / generative / copilot / llm / chatbot / prompt):

| Type | Heading match |
|------|----------------|
| suggestion | `suggest…` |
| generation | `generat…` (negative lookbehind excludes "regeneration") |
| authorization | `authori…`, `consent`, `permission`, `approval`, `opt-in` |
| handoff | `hand-off`, `escalat…`, `human fallback`, `fallback to…` |
| regeneration | `regenerat…`, `try again`, `retry` |
| history | `history`, `undo`, `conversation log` |

Heading-only + AI-context gating keeps generic `## History` (changelog) and `## Generation` (release notes) in non-AI docs from counting, and ignores pattern words in body text.

**Outcomes:**

- AI surface + ≥1 pattern doc → `info` (lists coverage n/6)
- AI surface + no pattern docs → `warning`
- No AI surface → no finding

## Scope

Docs-as-object, **presence only**. Doc *quality* is a separate semantic concern — no NLP in the static engine, in-repo files only, no crawling.

## Disabling

```
lyse-disable ai-governance/interaction-pattern-docs
```

in an adjacent `README` or `.lyse.yaml`, or via the `.lyse.yaml` `rules:` block:

```yaml
rules:
  ai-governance/interaction-pattern-docs: off
```
