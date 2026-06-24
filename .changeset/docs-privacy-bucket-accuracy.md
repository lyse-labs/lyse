---
"@lyse-labs/lyse": patch
---

Correct PRIVACY.md: `repo_bucket` and `file_hash` are computed **locally by the CLI** with an embedded client-side salt (`BUCKET_SALT`, rotated per minor release), not "server-derived" with a "server-side salt rotated daily" as the doc claimed. The shipped privacy notice now matches the code (`identity/repo-bucket.ts` + `telemetry/local-log.ts`).
