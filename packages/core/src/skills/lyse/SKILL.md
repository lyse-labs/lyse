---
name: lyse
description: Use when the user runs `lyse`, asks to fix design-system drift, or after a Lyse audit. Fixes token/a11y/component/AI-readiness issues a Lyse scan found.
version: "1.0.0"
---

# Lyse — fix design-system drift

Lyse scans a design system and scores its health (0–100). Your job: fix the issues it found, in the working tree.

## Workflow
1. Run `lyse audit` (or read the handoff `findings.json` + `tokens.json` if provided).
2. Fix issues by severity — errors first, then warnings. Fix the root cause; never suppress a rule.
3. For hardcoded values (color/spacing/radius/…), map them to the project's tokens — `tokens.json` maps each raw value to its token path; prefer the single exact match.
4. For each rule, run `lyse explain <ruleId>` for the rationale + good/bad examples (the canonical recipe).
5. Edit the working tree only. Do NOT commit and do NOT open PRs.
6. When done, verify. For a fast check of just your edits, run `lyse audit --scope uncommitted` (audits only the files you changed in the working tree) and confirm those findings are gone. For the overall result, run `lyse audit` and confirm the Health Score went up. If a rule still fires, your fix was incomplete.

## Notes
- `lyse audit --format=json` gives the full machine-readable report.
- Token names (no values) and the component inventory are in `LYSE.md` at the repo root.
