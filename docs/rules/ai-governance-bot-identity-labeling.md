# ai-governance/bot-identity-labeling

**Axis:** ai-governance | **Severity:** warning | **Track:** 16.8

## Why

Users have a right to know when they are interacting with an AI rather than a human. IBM HAX G1 ("Make clear what the system can do") and the Google PAIR "Set expectations" guidance — echoed by emerging disclosure regulation such as the EU AI Act transparency obligations — call for conversational AI surfaces to clearly label the agent as non-human, preventing deceptive anthropomorphism.

A dedicated, reusable non-human identity affordance (a bot/AI avatar or a labeled persona) gives teams a consistent, accessible way to disclose the agent's nature. Without one, teams ship human-looking avatars with no disclosure, or hand-roll inconsistent labels.

## How it works

Detection is gated on AI surface presence and uses per-file co-location with a **distinctive compound** vocabulary.

**Phase 0 — AI surface gate:** scans component files (`**/*.{tsx,jsx,vue}`) for an AI marker. If none is found, the rule emits nothing.

**Phase 1 — Co-located name scan:** within each file that contains an AI marker, checks exported identifiers and the file base name against the identity vocabulary (case-insensitive substring, separator-normalised):

| Pattern | Example matches |
|---------|----------------|
| `aiavatar` / `botavatar` / `assistantavatar` / `agentavatar` | `AiAvatar`, `BotAvatar`, `AssistantAvatar` |
| `aipersona` / `botpersona` / `assistantpersona` | `AiPersona`, `BotPersona` |
| `aiidentity` / `botidentity` | `AiIdentity`, `BotIdentity` |
| `nonhuman` | `NonHumanBadge`, `NonHumanLabel` |

A bare `bot` token is deliberately **not** used (it would false-fire on "bottom" / "robot"); only compound names match. A generic `Avatar` primitive does not count.

**Outcomes:**

- AI-marker present + non-human identity label co-located → `info`
- AI-marker present + no co-located identity label → `warning`
- No AI-marker → no finding

## Scope

Static "affordance present" slice (Track 16.8, manifest area L). Does not verify the label renders on every conversational surface.

## Disabling

```
lyse-disable ai-governance/bot-identity-labeling
```

in an adjacent `README` or `.lyse.yaml`, or via the `.lyse.yaml` `rules:` block:

```yaml
rules:
  ai-governance/bot-identity-labeling: off
```
