---
"@lyse-labs/lyse": patch
---

`lyse handoff --isolate`: run the agent against a throwaway `git worktree` at HEAD instead of your working tree, removed on timeout — the rollback the timeout alone could not give.

Off by default: `handoff` exists so you can review the work with `git diff` where you are sitting. This is for the unattended case, which wants a blast radius it can delete.

Refused on a dirty tree, loudly, with the handoff continuing without it: an isolated tree is checked out from HEAD, so with uncommitted work the agent would fix a version of the repository you cannot see. The tree state is read before Lyse writes its own `.lyse/handoff/*.json`, or Lyse would dirty the tree and then refuse on its own artefacts. The transcript stays in the real repository, since the isolated tree is deleted exactly when the log matters.

Also `LYSE_HANDOFF_ISOLATE=1` and `.lyse.yaml` `handoff.isolate`.
