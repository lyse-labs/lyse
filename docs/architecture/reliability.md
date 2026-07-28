# Reliability — how Lyse measures itself

> The Health Score is the central output of Lyse. If it is wrong, the whole product is wrong. This page explains how Lyse measures precision, how it measures recall, and what numbers you can trust.

## Why a reliability system

Every percentage Lyse cites is reproducible from a public dataset on your machine. No vibes, no hidden corpora, no silent formula changes.

## The 4 pillars

### Pillar 1 — Precision via opt-in user feedback

`lyse audit --interactive` walks each finding and asks `valid? (y/n/?/s/q)`. Your verdict is HMAC-bucketed (`repo_bucket = HMAC(rotating_salt, repo_remote_url)`, 16 hex chars), IP-stripped at Cloudflare Worker ingress, and aggregated into a Bayesian Beta(8, 2) prior — a new sub-axis starts at ~0.80 confidence on day one.

**Movement is weight-sensitive.** ~5 negative *signed* votes drop the posterior under 0.55; ~30 drop it under 0.30. Unsigned votes are weighted 10× lower (anti-spam), so ~50 unsigned drop the posterior 25 pp. Per-IP rate-limit (30 reqs/min) bounds the attack rate.

The full event payload is `{ ruleId, subAxisId, repoBucket, verdict, signed }` — no file path, line, message, or snippet. The whole loop is opt-in: gated on `~/.lyse/consent.json` (`accepted: true`), written by the first-run consent prompt or `lyse telemetry on`. Without consent, Lyse is fully local.

### Pillar 2 — Recall via the antivirus harness

Precision tells you whether a finding is real. Recall tells you whether you caught every finding that exists. Lyse measures recall against three sources:

- **Combinatorial generator** — ~30-50 format × context fixtures per rule across 4 contexts (CSS file, JSX inline style, styled-components, Tailwind arbitrary).
- **9 reference OSS design systems** — Cal.com, Twenty, Plane, Documenso, Cap, Formbricks, Mantine, Radix UI, shadcn/ui — mined for real-world violations.
- **Frozen gold set** — ~8k Claude-seeded provisional labels (see "Gold-set composition" below); community re-labels supersede. Maintained in [`github.com/lyse-labs/lyse-bench`](https://github.com/lyse-labs/lyse-bench) (CC BY 4.0).

Every Lyse PR runs `pnpm test:recall` in CI; the build blocks if any `stable` sub-axis's Wilson 95 % lower bound on **recall** drops below 0.90. Sub-axes ship `experimental` and promote to `stable` once calibrated past the gate.

**Known limit of the synthetic gate — the `info` blind spot.** The autonomous engine's oracle (`validation/audit-probe.ts#ruleFlagged`) counts only `error` and `warning` findings as a flag. Since the four-class resolver migration, the `novel` class on the seven **numeric** token axes (spacing, radii, border-width, opacity, z-index, breakpoints, motion durations) deliberately emits `info` — a value unlike any token is reported, but Lyse does not claim it is drift. A construction mutation that lands `novel` is therefore invisible to the oracle. **A `J=1` on one of those rules proves near-scale drift detection with no false positives on the set; it does not prove the far-from-scale branch,** which is covered by unit tests instead. Full detail and the fix that would close it in [`gate-b-spec.md`](./gate-b-spec.md#what-gate-a-cannot-see--the-info-blind-spot).

The separate `measure:recall` seeded-drift harness (`packages/core/rules-recall.json`, `recallSource: "seeded"`) is a narrower, non-gating CI regression net and candidate recall estimate — distinct from the antivirus/gold-set recall system described above.

#### Label provenance — git-mined conditional recall

A third, independent recall source: `pnpm mine:recall` (`scripts/mine-gold-recall.ts`,
run from the repo root) mines a pinned, non-Lyse OSS design-system corpus
(`scripts/gold-corpus/color.yaml`) for git commits where a developer tokenized a
hardcoded colour — replacing a literal with a token reference — then checks whether
today's `tokens/no-hardcoded-color` rule flags that literal on the tree as it stood
**before** the tokenization commit. Output: `packages/core/rules-recall-mined.json`,
`recallSource: "git-mined"`.

Because a design system's own repo would normally zone its source as
`ds-source` — where a raw colour is an expected token *definition*, not drift —
the harness forces `dsSelfMode` off on the checked-out tree so the mined literal
is measured as **app** (consumer) drift. So the number answers "would the rule
flag this literal as app-consumer drift," not "does Lyse flag it on the DS repo
as-is"; the bucket is labelled `zone: "app"` accordingly.

**What this number is, precisely.** It is **conditional recall on remediated
drift** — P(Lyse flags the value | a developer eventually tokenized it) — not
recall over all drift that exists in the wild. It is **survivorship-biased**:
only drift that was already found, judged worth fixing, and fixed by a human
is eligible to become a label at all. Drift nobody ever tokenized (because it
was subtle, low-traffic, or simply missed) cannot appear in this set, and
fixed drift skews toward the more obvious cases a maintainer would notice
in a diff. Treat it as a lower-bound sanity check on "does Lyse at least
catch the drift humans already agreed was drift," not as an estimate of
Lyse's recall over the true population of drift.

**How the label stays honest (ADR 0022 §3).** A candidate tokenization
commit only becomes a gold label if it clears every one of these, fail-closed:

- **Non-Lyse repos only** — the corpus is pinned OSS design systems that did
  not use Lyse, so no label can be circularly shaped by Lyse's own output.
- **Independent value-equality** — `reliability/gold/color-eq.ts` is a
  fresh, self-contained colour parser/comparator that never imports Lyse's
  own resolver; a mined label can never bless the resolver's own blind spots.
- **Structural-slot (Gate A) + value (Gate B) agreement** — the removed
  literal and the added token reference must occupy the *same* declaration
  slot (same property, same rule/selector, or same LHS for JS/TS), and the
  token's resolved value(s) must unanimously equal the removed literal.
  Any tangle (literal removed from one place, token added to another),
  ambiguous resolution, or disagreement drops the candidate — never
  fabricates a label.
- **Measurement-only, never gating** — `recallSource: "git-mined"` cannot
  be gate-eligible; enforced by
  `packages/core/tests/reliability/gold/non-gating.test.ts`, which proves
  even a relabelled, full-N bucket fails the gate because a recall-only
  bucket structurally carries no `precisionWilsonLB`.
- **No score change** — `mine:recall` is a `scripts/` measurement tool;
  `lyse audit` never invokes it.

**The result, honestly.** Across the 4 pinned corpus repos the walk finds
**70 candidate** tokenization commits (primer-css 42, primer-react 8,
canvas-kit 14, polaris 6). External token *values* are recovered from a
committed, pinned package **snapshot** — the token file the consuming repo
depended on at that commit (`scripts/gold-corpus/pins/<repo>/` with a
`PROVENANCE.json` recording `package@version:path` + a sha256), parsed by a
resolver-independent gold parser (`reliability/gold/token-file.ts`, which
imports neither `graph/resolve` nor `a11y/contrast`). This replaces the earlier
hardcoded value map: the value now comes from the real pinned artifact
(un-fabricable), not a hand-typed constant. With primer-css pinned to
`@primer/primitives@4.3.5`, **3** of its candidates confirm — for **N=3,
caught=3, recall=1.0, Wilson lower bound=0.439** (`tokens/no-hardcoded-color ·
exact · app`), up from N=1.

The other repos contribute 0, each for an honest, documented reason.
**canvas-kit** is now curated with a **JS-token snapshot**: its colours
reference the token as a JS member access (`base.orange400` from
`@workday/canvas-tokens-web`), and the harness resolves these through a
committed, curation-time-resolved JSON value map (member → CSS-var-name → the
package's own OKLCH value; `fetch-pins` JS mode, sha256-provenanced in
`PROVENANCE.json`). The resolver works: `base.orange400` resolves to
`oklch(0.7261 0.1852 52.58 / 1)`, which the independent parser — now OKLCH-aware
(`reliability/gold/color-eq.ts`) — converts to exactly `#fd7e00`, and **4 of
canvas-kit's 14 candidates are value-equal at the pixel**. Yet **all 14 correctly
reject**, because the sampled commit is not a migration at all: the file was
authored with tokens from birth, the prior hex written only into a trailing
comment (`base.orange400; //'#FD7E00'`) — verified, the const was never a
hardcoded literal anywhere in the file's history. The walk pairs the comment-hex
with the ref (a phantom candidate); Gate A / the parent-source check finds no
pre-migration value in the parent tree and fails closed. This is the harness
refusing the comment-hex fabrication trap, working exactly as designed.
**primer-react** and **polaris** resolve their colours through an *in-repo*
prevaled theme (a JS object) — the deliberately-forbidden in-repo scraping path
(#253) — so they are structurally excluded, not a curation follow-up. One
structural limit also bounds the CSS side: only a `var(--x)` reference whose
value ships as a CSS custom property (`--x:`) resolves — a bare SCSS `$var`
reference is not surfaced by the walk today.

This N is the honest **survivorship / data-availability wall** the design
anticipated, now confirmed on both sides: value-preserving colour→token commits
are CSS-dominated (primer-css's 2020 migration), while the JS side of the sampled
corpus offers no genuine migration to confirm — modern DS repos increasingly
author with tokens from the start (documenting the prior hex in a comment) rather
than retro-fit pre-existing hardcoded values. The **JS-token snapshot + OKLCH
lever is built and validated end-to-end** — it resolves canvas-kit's `base.*`
refs to their exact values — and stands ready for any future corpus entry that
*is* a genuine JS migration; on today's corpus it correctly adds 0. This is a
finding about the data, not a bug in the harness. Determinism is proven
separately: two runs over the same pinned corpus + committed snapshots produce
byte-identical buckets.

Because of this bias and this N, git-mined recall is always reported
**beside** the seeded synthetic recall above (`rules-recall.json`,
`recallSource: "seeded"`), never headlined alone — the two numbers bound the
truth from opposite directions: seeded recall shows whether the rule catches
constructed drift at scale; git-mined recall shows whether it catches the
specific, real drift a human once tokenized by hand.

### Pillar 3 — Coverage via the public catalogue

Lyse ships **6 axes** (`tokens`, `a11y`, `components`, `stories`, `ai-surface`, `ai-governance`) decomposed into **66 sub-axes** (1 per rule). Every sub-axis is tagged `stable`, `experimental`, or `disabled`. Only `stable` contributes to the Health Score by default. **Promotion gate (dual)** — both computed as a Wilson 95 % lower bound on **N ≥ 40** independently-provenanced samples: **recall ≥ 0.90** for a sub-axis to ship as a claim (`stable`), and **precision ≥ 0.90** for its findings to contribute to the Health Score (a rule that clears recall but not precision is reported at weight 0 until precision clears). **52 sub-axes are currently `stable`.** Honest status: today's `stable` set was calibrated under the earlier synthetic recall suite; migrating every `stable` rule onto the N ≥ 40 independent-provenance dual gate is in progress (per-rule state in [`docs/architecture/per-rule-slo.md`](./per-rule-slo.md)). The rest ship `experimental` (reported-only). The full catalogue is auto-generated at [`docs/architecture/sub-axes.md`](./sub-axes.md).

**score-v2 preview channel.** `lyse explain --score` also reports a read-only **preview** score over a strict superset of the trusted set: the deterministic structural sub-axes whose synthetic recall *and* precision Wilson 95 % lower bounds both clear the 0.90 gate but which are not yet promoted into the live score (flagged `contributesToScoreV2`). The preview never alters the trusted Health Score — it exists so the impact of promoting the AI-governance sub-axes can be inspected before any v1 change. Promoting a preview sub-axis into v1 (flipping `contributesToScore`) remains a deliberate release decision, not an automatic consequence of clearing the gate.

### Pillar 4 — Auto-improvement with a human gate

When the antivirus detects a regression, an LLM-driven pipeline runs on a schedule: failure detection clusters the misses, a diagnosis agent writes a ≤ 200-word explanation of why the rule missed (no code), a patch-proposal agent opens an isolated git worktree and asks an LLM for a full-file replacement, then a validation agent re-runs `test:recall` and `pnpm test` inside the worktree. If the patch improves the target rule without regressing any other rule by more than 1 pp, the pipeline opens a **draft** PR. A human approves in ~30 seconds. The pipeline never auto-merges — that would break the deterministic + version-pinned public claim and the audit trail.

## The 3 falsifiable claims

Marketing surfaces use only these three claims; everything else is a derivative.

1. **100 % deterministic — byte-identical output artifacts** — same input, same commit → byte-identical outputs. Verifiable: run `lyse audit --format=json` twice on the same git commit; the JSON output is identical. The scoring formula is version-pinned and stamped on the `AuditResult.scoringVersion` field of every emitted JSON artifact — currently `scoring-v3` by default (see [`scoring.md`](./scoring.md)). Any change to the score output is a semver-major event with a CHANGELOG entry and a new locked contract-test row.
2. **≥ 90 % recall and ≥ 90 % precision on every scoring `stable` sub-axis** — each a Wilson 95 % lower bound on N ≥ 40 independently-provenanced samples (recall gates the `stable` claim; precision gates the score contribution). The per-rule SLO is published at [`docs/architecture/per-rule-slo.md`](./per-rule-slo.md). The table is seeded with all 66 rules; promotion happens as independent calibration data accrues.
3. **Open catalogue of 66 sub-axes (1 per rule)** — status published per axis at [`docs/architecture/sub-axes.md`](./sub-axes.md). 52 sub-axes are `stable`; the rest ship `experimental` and promote to `stable` as calibration data accrues.

## Reproducing the numbers

Everything above runs on your machine. The gold set lives at [`github.com/lyse-labs/lyse-bench`](https://github.com/lyse-labs/lyse-bench) (live, CC BY 4.0); clone it, point `lyse audit` at it, and compare your numbers to the published ones. If a number is wrong, send a PR.

## Gold-set composition

The gold set ships **provisional** at ~8k entries labelled by Claude
(Opus 4.7) via `scripts/auto-label-gold-v1.ts`. Each entry is tagged `provisional: true`
and `annotator: claude-opus-4-7-heuristic-v2`, with a `confidence` score in [0, 1]
reflecting heuristic strength.

This is intentional and disclosed: the gold-set seeds the precision/recall machinery before
community contributions take over. Labels that gate a rule's `stable` promotion or its score
contribution must be **independently provenanced** — human or community, never authored by an
agent for a rule it implemented; these provisional Claude labels are the seed the independent
gold set supersedes, not the promotion gate itself. Methodology:

- Candidates mined from 9 pinned-SHA OSS design-system repos.
- Heuristic per rule (token-reference detection, file-context exclusion).
- Reproducible from `pinned-shas.json` + `auto-label-gold-v1.ts` at the matching git tag.

**Re-labelling.** The public `lyse-bench` repo (live, CC BY 4.0) accepts human-authored
corrections via PR. A community label supersedes the provisional Claude label of the
same `(repo, file, startLine)`. The Wilson-LB methodology in
[Pillar 2 — Recall via the antivirus harness](#pillar-2--recall-via-the-antivirus-harness)
remains unchanged — the bench composition is what evolves.

## Static-vs-LLM agreement (Cohen's kappa)

`packages/core/src/reliability/llm-eval/kappa.ts` computes, per governance
dimension, Cohen's kappa between the static rule verdict and the LLM grade,
plus precision/recall and their Wilson lower bounds (reusing
`wilsonLowerBound` from `promotion.ts`). A low kappa means a static rule has
drifted from the expert/LLM signal — the divergence signal described below.

The sub-axis calibration fields (`precisionMeasured`, `recallMeasured`,
`*WilsonLowerBound`, `lastCalibrated`) are **produced by running this
machinery over a labeled corpus** — they are never hand-committed. Until a
real per-dimension governance corpus exists, those fields stay `null`; the
machinery is exercised against in-repo fixtures only.

See also: [`docs/architecture/sub-axes.md`](./sub-axes.md), [`docs/architecture/per-rule-slo.md`](./per-rule-slo.md).

### Divergence signal

`packages/core/src/reliability/llm-eval/divergence.ts` implements the
self-policing mechanism: when a static rule's kappa falls **strictly below**
`DIVERGENCE_THRESHOLD = 0.4` (Landis & Koch 1977 "poor agreement" boundary),
`detectDivergence()` emits a `DivergenceDiagnostic`.

A `DivergenceDiagnostic` carries:

- `type: "rule-divergence"` — identifies it as a rule-health signal, not a DS-facing `Finding`
- `dimensionId` — the governance dimension that drifted
- `kappa` — the raw kappa value
- `disagreementRate` — `1 − observed agreement` (fraction of pairs where static ≠ LLM)

`buildKappaReport()` (schema `kappa/2.0`) runs `detectDivergence` over the
aggregated per-dimension results and attaches them under a `divergence` field.
Consumers can check `report.divergence` to find rules that have drifted from
the expert signal and should remain (or return to) `experimental` status.

The sub-axis calibration fields in `sub-axes.ts` stay `null` — the divergence
function operates on kappa inputs passed to it; it never commits measurement
values directly.
