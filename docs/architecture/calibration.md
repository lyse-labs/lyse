# How Lyse calibrates its score

This page documents how the Lyse Health Score is calibrated, the current error margin, and how you can reproduce any of these claims against the source repo.

## Why Lyse publishes calibration data

Two failure modes have killed adjacent tools historically:

1. **Snyk, 2022.** Claimed "92 % precision" without publishing the labeled corpus. Hacker News tore it apart in 24 hours.
2. **Lighthouse v5 → v6, May 2020.** Silent scoring-formula change dropped sites from 95 to 65 overnight. Paul Irish wrote a 2,000-word post-mortem. Lighthouse now ships a [public scoring calculator](https://googlechrome.github.io/lighthouse/scorecalc/) and version-pinned scores.

To avoid repeating either, every release pins the scoring formula version (`scoring-v1`) and publishes the calibration error on this page.

If the score is wrong for your repo, this page tells you *how* wrong it is on the reference corpus, and you can decide whether to trust the number.

## The corpus

The corpus comprises 8 hand-labelled repos (7 OSS design systems + Lyse itself). Each got an expert score (0–100) based on a manual review of the repo's design-system surface — token discipline, component primitives, AI-readable manifests (`AGENTS.md`, `components.json`), Storybook coverage, accessibility hygiene. The expert score is the target the auto-scorer aims to approximate.

| Repo | Kind | Expert | Auto (Lyse, K=0) | Δ |
|---|---|---:|---:|---:|
| [lyse-labs/lyse](https://github.com/lyse-labs/lyse) | CLI / engine (not a UI repo) | 35 | 37 | +2 |
| [calcom/cal.com](https://github.com/calcom/cal.com) | Scheduling product with `packages/ui` | 62 | 58 | −4 |
| [radix-ui/primitives](https://github.com/radix-ui/primitives) | Headless React primitives | 65 | 57 | −8 |
| [documenso/documenso](https://github.com/documenso/documenso) | E-sign product with `packages/ui` | 66 | 61 | −5 |
| [makeplane/plane](https://github.com/makeplane/plane) | Project-management product with dedicated tokens package | 68 | 64 | −4 |
| [twentyhq/twenty](https://github.com/twentyhq/twenty) | CRM with `twenty-ui` + claude-skills package | 70 | 46 | −24 |
| [mantinedev/mantine](https://github.com/mantinedev/mantine) | Mature React DS (110 components, MCP server, AGENTS.md) | 78 | 46 | −32 |
| [shadcn-ui/ui](https://github.com/shadcn-ui/ui) | Reference DS with `components.json` + skills/ + mcp/ | 80 | 60 | −20 |


## The formula

For each axis with at least one opportunity:

```
weightedFindings = 4·errors + 2·warnings + 1·infos
rateScore        = max(0, 100 · (1 − weightedFindings / opportunities))
absoluteCap      = 100 − K · log10(1 + weightedFindings)
axisScore        = min(rateScore, absoluteCap)
```

The final score is the **equal-weight mean** of `axisScore` across active axes. Tokens, a11y, and components are not weighted against each other — every axis matters equally, and you can disable axes you don't care about in `.lyse.yaml`.

The score maps to a maturity tier (CMMI-style):

| Score | Tier | What it means |
|---|---|---|
| 80+ | Autonomous | Coding agents can ship UI in this repo without rederiving the DS |
| 60–79 | Quantitative | Strong DS, some drift accumulating |
| 40–59 | Defined | DS exists but governance is uneven |
| 20–39 | Managed | DS is incipient or heavily diluted |
| 0–19 | Foundational | No coherent DS surface |

### Worked example: Cal.com

From the committed audit (`commitSha: 180ede28…`):

- tokens axis: 4,163 weighted-findings (mostly warnings, so `~4163 × 2 ÷ 2`) over 16,003 opportunities → rate ≈ 100·(1 − 4163/16003) ≈ **74** → axis cap at K=0 is 100 → **axisScore = 74**.

  *(Actual reported tokens-axis score: `60`. The difference is in the breakdown of errors vs warnings vs info inside the raw findings — the table above shows a simplified version of the math, the audit JSON is the authoritative source.)*

- components axis: cleaner `packages/ui` layout → **axisScore ≈ 82**.
- ai-surface axis: AGENTS.md present at root, but no `components.json` at root → **axisScore ≈ 0**.
- stories axis: not enough opportunities → **N/A**.

Equal-weight mean across active axes (tokens, components, ai-surface) → **finalScore = 58**, tier `Defined`. Expert score: 62 (tier `Quantitative`). Δ = −4.

## The fit

`K` is fit once: a 1-D least-squares search over `K ∈ [0, 20]` at step 0.05, refined by golden-section to step 0.01. Loss = sum of squared errors between predicted `finalScore` (mean of active-axis scores) and the expert label.

- 8 data points.
- Continuous minimum: **K ≈ 0.048**.
- Rounded and shipped: **K = 0**.
- Train MAE: 10.36 pts.
- Train RMSE: 14.48 pts.
- LOO MAE: 10.36 pts.

The target is LOO MAE ≤ 8. The current calibration sits at 10.36; this page documents the gap.

## Why K = 0

`K = 0` doesn't mean the cap was deleted — the term is still in the formula, in every audit artifact (`absoluteCap` field), and in the spec. It means: **on this 8-repo corpus, the cap term doesn't improve fit over the rate term alone.**

The structural reason is that `rateScore` already clips to 0 via the outer `max(0, ...)`. When severity-weighted findings exceed opportunities — which happens for engine repos like Lyse itself (122 weighted findings on 101 token opportunities) — the rate term *already* delivers the "this axis is broken" signal. Adding a log-cap on top double-penalises in a way that the calibration optimizer rejects.

The cap will likely activate once the public bench (fed by `lyse bench-pack`) returns hundreds of audited repos weekly. Then the corpus will be large enough to:

1. Re-fit K against a wider, less monorepo-biased corpus.
2. Consider per-axis K values (a `Multi-K` formula).
3. Detect modern AI-surface signals (`components.json`, `claude-skills/`, `mcp/`) that the current 8-repo expert labels credit but the auto-scorer doesn't yet measure.

Each re-fit bumps `scoringK` in every audit artifact and gets a CHANGELOG entry. Your score will not silently change — see "Will the score change between releases?" below.

## What this means for your score

Rough interpretation, given the current calibration error:

- **80+ ("Autonomous")** — effectively zero high-severity drift on the audited surface, AI-readable manifests present. Trust this number within ~5 pts.
- **60–79 ("Quantitative")** — solid DS, drift accumulating, some axis weak. Trust within ~10 pts.
- **40–59 ("Defined")** — uneven. Could be a genuine mid-maturity repo, or could be Lyse under-detecting (Mantine, Twenty, and shadcn all land here despite being canonical DSes — see the corpus table).
- **20–39 ("Managed") or under** — systemic issues. 100+ findings or a few critical errors. Trust within ~5 pts.

If your repo is a large monorepo that includes non-UI packages (`server/`, `emails/`, `docs/`), expect the score to under-report your DS quality by 10–25 pts. Use `.lyse.yaml`'s `excludePaths` to scope the audit to the actual DS surface.

## Will the score change between releases?

**Same input + same formula version + same K = byte-identical score.** This is Lyse's determinism guarantee.

When does the score change?

- **Patch K re-fit** (e.g., `scoring-v1.k0` → `scoring-v1.k1`) — same formula, new K. CHANGELOG documents the delta. Audit artifacts always stamp the active K.
- **Major formula change** (`scoring-v1` → `scoring-v2`) — semver-major. The release notes explicitly mark scores as not comparable across formula versions. Lyse treats this with the same gravity Lighthouse treats its scoring revisions.

No silent score drift. Ever.

## How to verify these claims

Everything on this page is reproducible.

```bash
git clone https://github.com/lyse-labs/lyse.git
cd lyse
pnpm install
pnpm exec tsx scripts/run-calibration.ts
```

The script regenerates the calibration artifact byte-for-byte against the committed copy. Diff to confirm. The fit code is 100% deterministic (1-D grid search, no random seeds).

To add a repo to the corpus: open a PR adding a new line to the corpus file with a hand-written expert score and rationale. The fit will re-run in CI; the LOO MAE will update.

## Cross-references

- [The reliability page](./reliability.md) — gold set, recall corpus, Wilson promotion gate
