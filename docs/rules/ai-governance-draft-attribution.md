# ai-governance/draft-attribution

**Axis:** ai-governance | **Severity:** warning | **Track:** 9.8

## Why

As AI assists more design-system content — copy, docs, even component scaffolds — transparent provenance becomes a trust and governance requirement. The "First draft created with [tool]" convention (HAX / emerging AI-disclosure norms, Appendix A) gives teams a lightweight, consistent way to attribute AI-assisted content so reviewers and users know what was machine-drafted.

## How it works

Gated on AI-surface presence (an AI-marker component). Scans `**/*.{tsx,jsx,vue,md,mdx,ts}` for either:

- **Phrase form** (anchored): `first draft` + an authoring verb (`created` / `made` / `generated` / `written` / `drafted`) + `with` / `by` / `using`. Generic "Created with Sketch" or "first draft of the proposal" do **not** match.
- **Structured markers**: `data-ai-generated`, `ai-generated` / `aiGenerated`, `drafted-with`, or a `DraftAttribution` / `AiAttribution` / `GeneratedWith*` identifier.

**Outcomes:**

- AI surface + convention present → `info`
- AI surface + absent → `warning`
- No AI surface → no finding

## Scope

Presence of the attribution convention. The anthropomorphism / tone lint originally grouped here moved to the semantic LLM-judgement layer — static string-matching FP rate is too high for tone.

## Disabling

```
lyse-disable ai-governance/draft-attribution
```

in an adjacent `README` or `.lyse.yaml`, or via the `.lyse.yaml` `rules:` block:

```yaml
rules:
  ai-governance/draft-attribution: off
```
