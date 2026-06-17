# ai-governance/ai-token-misuse

**Axis:** ai-governance | **Severity:** warning | **Track:** 9.5

## Why

AI design systems reserve a distinct visual language — gradient auras, sparkle accents, "magic" tokens — to signal *this content was AI-generated*. The signal only works if it is exclusive: if the same AI-reserved tokens are reused to decorate ordinary, non-AI UI, users can no longer trust the visual cue to mean "AI". IBM Carbon, Salesforce, and Microsoft AI guidelines all treat the AI visual treatment as reserved.

This rule (Appendix A static signal `ai-token-misused-on-non-AI-element`) catches the dilution at the source: a reserved AI token referenced outside any AI surface.

## How it works

**Usage, not definition.** The rule scans for reserved AI tokens being *used* — `var(--ai-*)`, `$ai-*`, `theme.$ai-*` — across `**/*.{tsx,jsx,vue,css,scss}`. Token *declarations* (`--ai-*:` / `$ai-*:`) are never flagged: defining a token is not misuse.

**AI-context suppression.** A file is a legitimate place to use AI tokens when any of these hold:

1. it contains an AI-marker component or JSX tag (`fileHasAiMarker`),
2. it is AI-named by path (e.g. Carbon's `_ai-aura.scss`), or
3. it defines reserved AI tokens itself (the token-source file).

A reserved AI token used in a file that satisfies none of these (e.g. a generic `Button.css`) is flagged.

**Reserved-token vocabulary** reuses `isReservedTokenName` — Carbon `--cds-ai-*` / `$ai-aura-*`, Cloudscape `$*-gen-ai`, Polaris `magic-*`, and the precision-gated bare-`ai`-plus-distinctive cases. Mantine's `--ai-bg` / `--ai-size` (ActionIcon) do not match.

**Outcomes:**

- Reserved AI token used in a non-AI-context file → `warning` (misuse).
- Reserved AI token used only in AI-context files → no finding.
- No reserved AI tokens used anywhere → no finding (rule is N/A).

## Scope

Static "misuse present" slice (Track 9.5, manifest area L). File-level co-location, not element-level — element-precise attribution is later AST work. Ships `experimental` (advisory) until measured precision.

## Disabling

```
lyse-disable ai-governance/ai-token-misuse
```

in an adjacent `README` or `.lyse.yaml`, or via the `.lyse.yaml` `rules:` block:

```yaml
rules:
  ai-governance/ai-token-misuse: off
```
