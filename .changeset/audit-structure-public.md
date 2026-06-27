---
"@lyse-labs/lyse": patch
---

Audit structure sweep: unify the repo_bucket fingerprint, dedup helpers, and tighten correctness.

- **Feedback telemetry repo_bucket** now uses the canonical identity fingerprint (sha256 with credential-stripping normalization) instead of a separate HMAC variant. Git credentials (`user:token@`) embedded in a remote URL can no longer leak into the anonymous fingerprint. The bucket value for the feedback path changes (old HMAC → canonical sha256); it remains anonymous and opt-in.
- **Clipboard accuracy:** the agent handoff "copy prompt to clipboard" action now reports success only when the copy actually succeeds; on failure it points you to the saved `.lyse/handoff/` payload instead of falsely claiming "copied".
