---
"@lyse-labs/lyse": patch
---

`pnpm ecosystem:diff` — build the CLI from a baseline ref and from the working tree, run both over the same 14 pinned third-party repositories, and report every behavioural difference.

No ground truth is needed and none is claimed: it says what *changed*, and a human decides whether the change is an improvement. It complements `bench-golden` rather than replacing it — a committed snapshot is an artefact that goes stale, and whoever's PR turns it red is the person who regenerates it. Reviewable at four repos; a rubber stamp at fourteen. A main-vs-candidate diff has no artefact to regenerate: the only way to make it empty is to not change behaviour.

Also fixes a check that never ran: the workspace-root vitest config covered `tests/**` only, and `pnpm test` is `pnpm -r test`, which skips the workspace root entirely. `scripts/oracle-verdict.test.ts` — which pins "not measured is not a pass" for the real-repo oracle — had therefore never executed anywhere, nor had `tests/tools/**`. The root config now includes `scripts/**` and `pnpm test` runs it: 6 test files and 30 tests that previously ran nowhere, all passing.
