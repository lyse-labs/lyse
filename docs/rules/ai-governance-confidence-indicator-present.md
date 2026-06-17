# ai-governance/confidence-indicator-present

**Axis:** ai-governance | **Severity:** warning | **Track:** 16.8

## Why

Generative AI output is probabilistic — it can be confidently wrong. IBM HAX G2 ("Make clear how well the system can do what it can do") and the Google PAIR Explainability + Trust guidebook require AI interfaces to communicate uncertainty, so users can calibrate how much to trust a given result rather than treating every answer as authoritative.

A dedicated, reusable confidence affordance (badge, score, meter, or qualitative low/medium/high indicator) gives teams a consistent vocabulary and accessible UX for surfacing model uncertainty. Without one, teams either omit uncertainty entirely (over-trust) or hand-roll inconsistent ad-hoc indicators.

## How it works

Detection is gated on AI surface presence and uses per-file co-location.

**Phase 0 — AI surface gate:** scans component files (`**/*.{tsx,jsx,vue}`) for an AI marker. If none is found, the rule emits nothing.

**Phase 1 — Co-located name scan:** within each file that contains an AI marker, checks exported identifiers and the file base name against the confidence vocabulary (case-insensitive substring, separator-normalised):

| Pattern | Example matches |
|---------|----------------|
| `confidence` | `ConfidenceBadge`, `ConfidenceScore`, `ConfidenceLevel` |
| `uncertainty` | `UncertaintyIndicator`, `UncertaintyBadge` |
| `certainty` | `CertaintyMeter` |

A confidence component only earns credit when it lives in the same file as an AI marker, so a statistical `ConfidenceInterval` chart in an unrelated file does not falsely count.

**Outcomes:**

- AI-marker present + confidence indicator co-located → `info`
- AI-marker present + no co-located confidence indicator → `warning`
- No AI-marker → no finding

## Scope

Static "affordance present" slice (Track 16.8, manifest area L). Does not verify the indicator appears at every AI-output render site.

## Disabling

```
lyse-disable ai-governance/confidence-indicator-present
```

in an adjacent `README` or `.lyse.yaml`, or via the `.lyse.yaml` `rules:` block:

```yaml
rules:
  ai-governance/confidence-indicator-present: off
```
