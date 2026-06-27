---
"@lyse-labs/lyse": patch
---

Audit judgment fixes:

- `lyse audit` no longer prompts for an email. Email is captured only by the
  `lyse init` wizard; audit still silently retries delivery of an email you
  already opted into during init if an earlier send failed offline.
- The LLM precision filter now drops any source file whose content matches a
  high-confidence secret scan (PEM private-key blocks; AWS/OpenAI/GitHub/Slack
  token shapes; quoted long `api_key`/`secret`/`token`/`password` assignments)
  before sending it to the LLM — making the PRIVACY notice's secret-exclusion
  promise true.
- Fixed the precision/recall labelling in the `bench kappa-report` diagnostic
  (false positives and false negatives were swapped).
- Documented the `lyse handoff` trust boundary (it launches your coding agent
  with permission prompts bypassed — run only on repositories you trust).
