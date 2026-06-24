---
"@lyse-labs/lyse": patch
---

Remove confirmed dead code from the package: the unused `util/git.ts` (`gitHeadSha`/`modifiedFilesWithHashes` — no production caller; a vestigial test mock was masking it), `reliability/correlation.ts` (`spearmanRho`, the unbuilt external-validity gate), `loaders/token-graph.ts` (`checkThemeParity`, "no rule yet"), `parsers/tailwind-v4.ts` (`parseTailwindV4Theme` — the live Tailwind-v4 path is `loaders/tokens.ts`), the empty `reliability/index.ts` barrel, the entire unreachable `credentials/` store (which orphaned the `keytar` optionalDependency, now also dropped), and three JSON schemas shipped in the tarball with zero references (`lyse-license`, `lyse-llm-payload`, `lyse-llm-response`). None were re-exported from the package entry. ~1,160 LOC removed; full suite green.
