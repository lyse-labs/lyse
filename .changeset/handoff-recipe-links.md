---
"@lyse-labs/lyse": patch
---

`lyse handoff`: `.lyse/handoff/findings.json` entries now carry a `helpUri` recipe link (from the rule's registered metadata) when one exists, so the agent doesn't have to re-derive it — mirrors the `recipe:` line already in the handoff prompt. The prompt itself now flags rule groups at migration scale (distinct file count at/above `advisory.migrationScaleFileCount`, default 40) with a sampling instruction: fix ~5 files, re-run `lyse audit --scope uncommitted`, confirm the recipe holds, then stop and ask the maintainer to sign off before sweeping the rest.
