---
"@lyse-labs/lyse": patch
---

`lyse audit --format=sarif` now emits valid SARIF 2.1.0. A finding's prose `suggestion` was serialised as a `fixes[]` entry carrying only a description, but the schema requires `artifactChanges` on every fix — 13 of 182 results on a real repository failed validation against the schema Lyse itself names in `$schema`, across ten rules. The suggestion moves to `properties.suggestion`, which is free-form and makes no false claim about being an applicable change.
