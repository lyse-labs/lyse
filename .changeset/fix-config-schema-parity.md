---
"@lyse-labs/lyse": patch
---

Fix the published `schemas/v1/lyse-config.json` JSON schema, which had drifted from the zod contract that actually validates `.lyse.yaml` and false-rejected valid configs. The schema now mirrors `LyseConfigSchema`: it accepts `scoring.aiGovernanceGraceWindow`, the full `i18n` block, the `rules` `"off"` literal plus `tolerance`/`disable` entries, and the `none`/`agent-cli` llm provider and `agent-cli` connector; and it drops phantom fields the runtime never reads (`schemaVersion`, `output`, `telemetry`, `mcp`, `license`, `designSystem.intentMap`, `rules.*.ignore`). A new parity test (`tests/config/schema-json-parity.test.ts`) drives a battery of configs through both zod and the JSON schema and asserts they agree, so the two contracts can't silently diverge again.

Also removes the dead `scripts/release-check.ts` pre-flight gate (and its `release:check` package script): it referenced two undefined functions (crashed on load), hard-coded `EXPECTED_SUB_AXES = 17` against a live 65, and assumed a manual `lyse@0.1.0` publish that Changesets replaced. The CI `test`/`engine` gates plus Changesets are the release guarantees now.
