# ai-governance/source-attribution-present

**Axis:** ai-governance | **Severity:** warning | **Track:** 16.8

## Why

Generative AI answers are most trustworthy when they cite where their claims come from. IBM HAX G11 (explainability of outputs) and the Google PAIR Explainability + Trust guidebook call for AI interfaces to attribute sources, so users can verify generated claims rather than taking them on faith — directly mitigating hallucination harm.

A dedicated, reusable source-attribution component (citation list, inline citations, provenance panel) gives teams a consistent, accessible pattern for surfacing the documents or data behind an answer. Without one, teams either omit attribution (unverifiable output) or hand-roll inconsistent citation UIs.

## How it works

Detection is gated on AI surface presence and uses per-file co-location.

**Phase 0 — AI surface gate:** scans component files (`**/*.{tsx,jsx,vue}`) for an AI marker. If none is found, the rule emits nothing.

**Phase 1 — Co-located name scan:** within each file that contains an AI marker, checks exported identifiers and the file base name against a **distinctive** attribution vocabulary (case-insensitive substring, separator-normalised):

| Pattern | Example matches |
|---------|----------------|
| `citation` | `Citation`, `Citations`, `SourceCitation` |
| `attribution` | `Attribution`, `SourceAttribution` |
| `provenance` | `Provenance`, `ProvenancePanel` |

The bare generic `source` / `reference` are deliberately excluded to avoid matching `SourceCode` / `ReferenceDocs`. An attribution component only earns credit when co-located with an AI marker, so a generic academic `Citation` component in a non-AI file does not falsely count.

**Outcomes:**

- AI-marker present + attribution component co-located → `info`
- AI-marker present + no co-located attribution component → `warning`
- No AI-marker → no finding

## Scope

Static "affordance present" slice (manifest area L). Does not verify citations appear at every AI-output render site, nor validate their correctness.

## Disabling

```
lyse-disable ai-governance/source-attribution-present
```

in an adjacent `README` or `.lyse.yaml`, or via the `.lyse.yaml` `rules:` block:

```yaml
rules:
  ai-governance/source-attribution-present: off
```
