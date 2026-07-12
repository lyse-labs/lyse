# Actionable findings — projection, grouping, migration-scale, recipe links — Design

Sprint 1 items 4–7 of `PROGRAM.md`, as one coherent change: the audit
stops presenting a flat list of problems and starts presenting **moves**
— what to fix, what it's worth, and how big the blast radius is — both
to the human (terminal) and to the agent (handoff). No Health Score
change anywhere.

## 1. Score projection (deterministic, computed in the pipeline)

After scoring in `audit-pipeline.ts` (`scoreFromFindings` call site,
~line 623), compute per-group projections while `opportunitiesByAxis`
and the `aiGovernanceGrace` factor are still in scope — the reporter
cannot honestly reconstruct them:

- **Grouping key**: `finding.fixGroup.key` when present (already
  `"<ruleId>::<from>"`), else `ruleId`. One group = one coherent fix.
- For each of the largest groups, recompute
  `scoreFromFindings(findings \ group, opportunitiesByAxis, sameOpts)`
  and record `gain = projectedScore − finalScore` (0-floored; skip
  groups with gain 0 unless nothing has positive gain).
- Attach to the result:
  `meta.projection = { top: [{ key, ruleId, from?, to?, count, files, gain }... max 3], totalGainTop3 }`
  (keys sorted deterministic; ties broken by count desc then key asc).
  Additive `meta` field — JSON output grows a field, schemaVersion 2
  unchanged (additive), SARIF/HTML/TSV untouched.
- Cost: ≤ K+1 scorer runs (K=3 candidate cap after ranking by count);
  the scorer is pure arithmetic — negligible.

**Card rendering**: one line under the gauge, e.g.
`↗ fix the top 3 drift groups → +8 pts` (dim, omitted when
totalGainTop3 is 0 or projection absent). Exact glyph: `↗` unicode /
`^` ascii, colored `pass`.

## 2. Top findings grouped by fix

`topFindings` in `reporters/terminal.ts` groups by the same key:

- One block per group (ranked by gain when projection exists, else by
  count): severity-colored ruleId (doc-linked, as today), `×N` count,
  first location + `and N−1 more sites`, message of the representative
  finding, and when `fixGroup.to` exists:
  `→ replace with <to>  ·  one fix clears all N findings.`
- `--verbose` / explicit `--limit` keep today's flat per-finding list
  (machine-ish consumers and deep dives unchanged); the grouped view is
  the new default-mode presentation.
- The existing 5-item cap applies to groups instead of findings in
  default mode; "N more findings" line becomes "N more groups".

## 3. Migration-scale advisory

- `MIGRATION_SCALE_FILE_COUNT = 40` in the new module (below),
  overridable via `.lyse.yaml`: `advisory: { migrationScaleFileCount: number }`
  (zod schema + JSON-schema parity test updated; validated ≥ 2).
- A group whose distinct-file count ≥ threshold is `migrationScale: true`
  in `meta.projection.top` entries and in handoff grouping.
- Terminal: groups render a warn-colored suffix
  `⚠ migration-scale (N files) — sample before you sweep`.
- Handoff prompt (`agent/payload.ts`): migration-scale rule groups get
  an explicit instruction block: fix a representative sample (~5 files),
  re-run `lyse audit --scope uncommitted`, confirm the recipe holds,
  and STOP for maintainer sign-off instead of mass-editing the rest.

## 4. Recipe links in the handoff artifact

`agent/handoff.ts` serializes `findings.json` as raw `Finding[]`; the
per-rule `helpUri` exists only in the prompt text. Fix: serialize
`findings.json` entries as `Finding & { helpUri?: string }` (looked up
once per rule via `getRegisteredRuleMeta`), so JSON consumers get the
canonical recipe link the prompt-reading agent already gets. Additive;
`tokens.json` untouched.

## Shared implementation shape

New module `packages/core/src/report/fix-groups.ts` (pure):
`groupFindings(findings): FindingGroup[]` (key, ruleId, from/to,
findings, distinct files) + `rankGroups`, consumed by the pipeline
(projection), terminal (grouped top findings), and payload
(migration-scale note) — one grouping implementation, three consumers.
`computeProjection(groups, findings, opportunitiesByAxis, opts, cap=3)`
lives beside it.

## Constraints

- **No Health Score change** — projection is presentation-only math on
  top of the existing scorer; determinism preserved (no randomness, no
  clock).
- Strict TS; no new deps; snapshot updates via the established harness,
  byte-verified; machine formats: `lyse.json` gains only the additive
  `meta.projection`; SARIF/TSV/HTML byte-identical.
- CHANGELOG + changesets per user-facing piece (projection+grouping
  minor; helpUri patch; advisory minor).

## Testing

- `fix-groups.test.ts`: grouping keys (fixGroup vs ruleId fallback),
  ranking, distinct-file counting, migration-scale flagging, threshold
  override.
- `projection.test.ts`: gain math against hand-computed scorer values
  (6-axis fixture), cap, zero-gain omission, determinism (two runs
  identical).
- Terminal tests: grouped default view, verbose fallback to flat list,
  projection line render/omission, migration-scale suffix; snapshot
  regenerated via harness.
- Handoff tests: findings.json entries carry helpUri; migration-scale
  block appears in the prompt for a ≥threshold group and not below it.

## Out of scope

Mascot/expressive glyph (own micro-spec later); homepage demo (Sprint
4); any scoring change.
