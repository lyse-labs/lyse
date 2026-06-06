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

Every Lyse PR runs `pnpm test:recall` in CI; the build blocks if any `stable` sub-axis's Wilson 95 % lower bound on **recall** drops below 0.90. The 17 sub-axes ship as `experimental` and stabilize after 4 consecutive green Bench weeks.

### Pillar 3 — Coverage via the public catalogue

Lyse ships **5 axes** (`tokens`, `a11y`, `components`, `stories`, `ai-surface`) decomposed into **17 sub-axes** (1 per rule). Every sub-axis is tagged `stable`, `experimental`, or `disabled`. Only `stable` contributes to the Health Score by default. Promotion gate: N ≥ 30 hand-labelled samples AND Wilson 95 % LB ≥ 0.90 on recall (precision LB is a follow-up once compliant-case generators land). The full catalogue is auto-generated at [`docs/architecture/sub-axes.md`](./sub-axes.md). Every sub-axis currently ships as `experimental` — the system runs dormant and the gold set grows it.

### Pillar 4 — Auto-improvement with a human gate

When the antivirus detects a regression, an Opus 4.7-driven pipeline runs nightly: failure detection clusters the misses, a diagnosis agent writes a ≤ 200-word explanation of why the rule missed (no code), a patch-proposal agent opens an isolated git worktree and asks Opus for a full-file replacement, then a validation agent re-runs `test:recall` and `pnpm test` inside the worktree. If the patch improves the target rule without regressing any other rule by more than 1 pp, the pipeline opens a **draft** PR. A human approves in ~30 seconds. The pipeline never auto-merges — that would break the deterministic + version-pinned public claim and the audit trail.

## The 3 falsifiable claims

Marketing surfaces use only these three claims; everything else is a derivative.

1. **100 % deterministic on the JSON artifact** — same input, same Health Score, byte-for-byte. Verifiable: run `lyse audit --format=json` twice on the same git commit; the JSON output is identical. Scoring formula is pinned as `scoring-v1` and stamped on the `AuditResult.scoringVersion` field of every emitted JSON artifact. Bumping to `scoring-v2` is a semver-major event with a CHANGELOG entry.
2. **≥ 90 % recall on every `stable` sub-axis** — measured against the public gold set, reported as a Wilson 95 % lower bound on N ≥ 30 hand-labelled samples. The per-rule SLO is published at [`docs/architecture/per-rule-slo.md`](./per-rule-slo.md). The table is seeded with the 17 rules; promotion to `stable` happens as the gold set grows.
3. **Open catalogue of 17 sub-axes (1 per rule)** — status published per axis at [`docs/architecture/sub-axes.md`](./sub-axes.md). All 17 sub-axes ship as `experimental`; promotion to `stable` happens as the gold set grows.

## Reproducing the numbers

Everything above runs on your machine. The gold set lives at [`github.com/lyse-labs/lyse-bench`](https://github.com/lyse-labs/lyse-bench) (live, CC BY 4.0); clone it, point `lyse audit` at it, and compare your numbers to the published ones. If a number is wrong, send a PR.

## Gold-set composition

The gold set ships **provisional** at ~8k entries labelled by Claude
(Opus 4.7) via `scripts/auto-label-gold-v1.ts`. Each entry is tagged `provisional: true`
and `annotator: claude-opus-4-7-heuristic-v2`, with a `confidence` score in [0, 1]
reflecting heuristic strength.

This is intentional and disclosed: the gold-set seeds the precision/recall machinery before
community contributions take over. Methodology:

- Candidates mined from 9 pinned-SHA OSS design-system repos.
- Heuristic per rule (token-reference detection, file-context exclusion).
- Reproducible from `pinned-shas.json` + `auto-label-gold-v1.ts` at the matching git tag.

**Re-labelling.** The public `lyse-bench` repo (live, CC BY 4.0) accepts human-authored
corrections via PR. A community label supersedes the provisional Claude label of the
same `(repo, file, startLine)`. The Wilson-LB methodology in
[Pillar 2 — Recall via the antivirus harness](#pillar-2--recall-via-the-antivirus-harness)
remains unchanged — the bench composition is what evolves.

See also: [`docs/architecture/sub-axes.md`](./sub-axes.md), [`docs/architecture/per-rule-slo.md`](./per-rule-slo.md).
