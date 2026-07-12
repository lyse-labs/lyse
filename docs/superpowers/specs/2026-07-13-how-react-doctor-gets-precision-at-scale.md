# How react-doctor gets 400 precise rules — and why Lyse doesn't (yet)

Root-cause analysis, not a reuse list (see the two prior specs for that).
Question: what SPECIFIC mechanisms let react-doctor ship 400 rules that
hold up, when Lyse's own measurement program proved the opposite is easy
to get wrong — `tokens/no-hardcoded-color` passed synthetic adversarial
proof (J=1, Wilson LB ~0.90) then measured **65% real-world precision**
across 8 OSS repos; two other detection rules that cleared the same
synthetic bar measured **22% and 6%** real precision against a fair judge
(source: `HANDOFF-2026-06-30.md`, `measurement-report.md`). This document
is that gap's autopsy.

## The 14 mechanisms, in order of leverage

### 1. They don't write most rules from scratch — they PORT

**108 of 400 registered rules (27%) are direct ports** of
`eslint-plugin-react`, `eslint-plugin-jsx-a11y`, `eslint-plugin-react-
hooks`, and Next.js's own lint rules — years-old, community-hardened
detectors, re-hosted as oxlint JS plugins. They inherited someone else's
false-positive scar tissue for free. Lyse has exactly **one** rule built
this way — `a11y/essentials` wraps `eslint-plugin-jsx-a11y` in-process —
and it is, not coincidentally, one of Lyse's most reliable rules.

**Why this doesn't fully transfer:** design-token drift is a genuinely
novel domain — nobody else has built `tokens/no-hardcoded-color` or
`components/no-arbitrary-tailwind` for us to port. But structural rules
(`naming/*`, `stories/*`, some `ai-surface/*`) may have adjacent
ecosystem tools worth wrapping instead of hand-rolling.

### 2. Ported-rule tests are codegen'd FROM the upstream project

For the `react-builtins`/`a11y` buckets specifically, test fixtures are
**auto-extracted from oxc's own upstream pass/fail vectors**
(`scripts/generate-fixture-tests.mjs`, `extract-oxc-fixtures.mjs`) — each
rule's test count is asserted to equal the upstream project's own test
count. They get thousands of regression cases for free by inheriting
someone else's suite, not writing 516 test files by hand.

### 3. Cross-cutting false-positive suppression is centralized, not per-rule

The `defineRule` wrapper auto-applies `skipNonProductionFiles` to any
rule tagged `test-noise`, and auto-detects/bails on non-React JSX
dialects for any rule tagged `react-jsx-only` — implemented **once**, in
one file, opted into declaratively. Lyse's 66 rules each hand-roll their
own version of things like dsSelfMode checks and test-file exclusion —
duplicated logic that can silently drift out of sync between rules.

### 4. Capability gating removes noise at the registry layer, not the visitor

A rule declares `requires: ["react-native"]` / `disabledWhen:
["react-compiler"]` and is **compiled out entirely** for a project where
it can't apply or is moot — zero runtime cost, zero risk of a stray
finding, no per-rule guard clause needed. Lyse's rules mostly self-check
`ctx` at runtime instead.

### 5. `defaultEnabled: false` is an honest escape valve for subjective rules

Their `design` bucket (e.g. `no-z-index-9999`) is registered, documented,
testable — but ships **off by default**, explicitly because it's "house
style, not correctness." They don't force every rule through the same
precision bar; they sort rules into "objectively wrong" vs "opinion" and
only gate the former. Lyse's `experimental`/`contributesToScore` flags
already do this — this mechanism is the one item on this list Lyse
already has at parity.

### 6. The liveness gate is cheap and catches a different bug class entirely

Every registered rule must fire on ONE canonical bad-code fixture, or be
explicitly allowlisted with a reason (`KNOWN_UNCOVERED`), checked in CI.
This is not a precision guarantee — it's a **"the rule isn't silently
dead" guarantee**: catches import bugs, registration bugs, a visitor that
stopped matching after a refactor. Mechanical, near-zero cost, and Lyse
doesn't have it.

### 7. The fuzzer is seeded from REAL agent-session traces, not synthetic grammar — THIS IS THE KEY MECHANISM

Their fuzz corpus generator (`packages/fuzz`) doesn't just generate
random-but-valid JS. Its grammar (`snippet-pools.ts`) is **distilled from
actual Claude Code session transcripts plus 13 real react-bench repos**,
so the synthetic test programs are statistically shaped like code an AI
coding agent actually produces — exactly their target failure mode
("your agent writes bad React"). Four oracles run against every program:
**crash**, **slow (>2s, re-verified against CPU-contention flukes)**,
**metamorphic invariant** (a semantics-preserving rewrite must not change
the verdict — catches precision regressions), and **verdict-drop** (a
no-op rewrite that silences a previously-firing rule = a false-negative
evasion — catches recall regressions). A fire-coverage feedback loop
spawns mutated descendants of any program that fires a rule, concentrating
fuzzing budget where it's productive.

**This is precisely the mechanism that would have caught Lyse's own
color-rule gap before shipping it.** The failure Lyse measured — 90%
synthetic score, 22-65% real score — is exactly what happens when your
test corpus is grammar-shaped instead of real-code-shaped. React-doctor
doesn't avoid this by being smarter about writing rules; they avoid it by
**never trusting a synthetic-only proof in the first place**, the same
principle Lyse's own corpus-confirmation gate already enforces — they
just built the machine that generates enough real-shaped adversarial
input to make that gate meaningful at scale, continuously, instead of via
occasional manual harvest passes.

### 8. The real-world eval corpus is two orders of magnitude larger

An **8.4k-repo pinned eval corpus** (`react-doctor-evals`, referenced but
not itself checked into this repo; CI runs a 48-repo subset for speed).
Lyse's tier-1 bench corpus is **70 repos**. This is a scale gap that
tooling alone doesn't close — it took sustained real-world usage
(thousands of installs, `react-doctor@latest` running on real codebases
continuously) to accumulate.

### 9. `fn-mining`: systematic false-negative hunting, not ad hoc

For each shipped rule, `scripts/fn-mining/` generates syntactic variants
of the rule's own "bad" pattern and reports which variants do **not**
fire (`[fired]` vs `[SILENT]`), for human triage. This targets exactly
the failure mode precision-focused rules are prone to: over-tightening a
rule to kill false positives quietly kills recall too, and nobody notices
because nothing crashes.

### 10. A private rule-candidate mining pipeline vets ideas before writing them

`docs/rule-candidates-backlog.md` — roughly 200 candidate rules,
generated by "a 12-cluster mining pass" over an accumulated personal
notes vault, each tiered by **corroboration strength** (how many
independent real-world observations support the pattern) and
**false-positive risk**, before a single line of rule code is written.
They don't start writing a rule speculatively; they only start once
cross-referenced evidence says it's worth it.

### 11. Every false-positive guard cites the specific corpus miss that motivated it

Rules like `no-array-index-as-key.ts` run **1212 lines** for one rule —
dozens of carve-outs, each with an inline comment naming the real code
example that forced it. Precision accumulates **empirically, from real
bug reports over time**, not from anticipating every edge case up front.
This is the same discipline Lyse's honest-measurement program already
practices in spirit (Wilson LB, refusing to promote unconfirmed rules) —
the difference is operational: they've made "cite the corpus miss" a
mandatory convention enforced by review, continuously, across 400 rules.

### 12. Delta-audit nightly catches regressions automatically, in production, continuously

A cron job scans a pinned OSS corpus with the current build and diffs
per-rule finding counts against a committed baseline: a rule going from
some findings to zero is probably broken; a rule spiking 3×+ is probably
a new false-positive source. Lyse has ~90% of the infrastructure for this
already (`.bench-corpus/`, the measurement harness) — what's missing is
making it run nightly with a committed baseline and a hard gate, instead
of on-demand.

### 13. Rule-authoring convention mandates dedup search before writing anything new

Their `rule-writing` skill explicitly instructs searching existing
detectors (via a fuzzy code-search tool) before adding new logic — keeps
400 rules from drifting into 400 slightly-different reimplementations of
the same three false-positive guards.

### 14. Honest caveat: some of the gap is just time, headcount, and volume — no tooling shortcut closes it

Million Software, Inc. is a funded team shipping ~weekly for over a year
(102 npm versions, `0.0.1`→`0.7.6`) with real production usage volume
feeding back false-positive reports continuously. **A 6× rule-count gap
(66 vs 400) will not close from better tooling alone.** What the
mechanisms above *can* close is the **precision gap**, which is the more
damaging one for trust and the one Lyse's own measurement program already
proved is currently real.

## What this means for Lyse, concretely

Lyse's instinct is arguably *more* rigorous than react-doctor's on one
axis already: refusing to promote a rule on synthetic proof alone, and
being transparent when a rule can't honestly hit 90% (the
`tokens/no-hardcoded-color` reliability section says this in the rule
doc itself — react-doctor has no equivalent public admission anywhere in
their docs). The gap isn't rigor of *intent* — it's the **operational
machinery that generates enough real-shaped adversarial signal, fast
enough, to make that rigor bite at scale.**

Ordered by leverage-per-effort, given what's already built (measurement
harness, bench corpus, agent-cli connector, corpus-confirmation gate):

1. **A fuzz corpus seeded from real code shape, not grammar** (mechanism
   7) — the single highest-leverage item. Lyse already has the
   agent-cli connector and the bench corpus; the missing piece is a
   generator that mutates real fixture/corpus snippets instead of (or
   alongside) hand-written adversarial fixtures, plus a verdict-drop
   oracle over the existing rule set. This directly targets the exact
   failure the color rule already exposed.
2. **Liveness gate** (mechanism 6) — near-zero cost, add this first.
3. **fn-mining** (mechanism 9) — cheap given existing rule/adapter infra;
   surfaces recall gaps the current precision-focused measurement
   program doesn't look for.
4. **Delta-audit promoted from on-demand to nightly-with-baseline**
   (mechanism 12) — ~90% built already.
5. **Centralize the cross-cutting FP-suppression logic** (mechanism 3) —
   an audit pass over the 66 existing rules to find and consolidate
   duplicated guard clauses (dsSelfMode checks, test-file skipping) into
   `_rule-module.ts`, the same way `createLyseRule` already centralizes
   metadata.
6. **Publish a rule-candidates backlog** (mechanism 10) from the
   measurement-report's own findings — cheap, and Lyse already generates
   the underlying evidence.
7. **Grow real-world corpus coverage cheaper than manual curation**: the
   biggest structural gap (mechanism 8, 70 vs 8.4k repos) is likely best
   closed not by curating thousands of repos by hand, but by an opt-in,
   privacy-preserving feedback loop from real `lyse audit` runs — which
   findings get suppressed/fixed vs. ignored — since Lyse already has the
   NDJSON local-log + opt-in telemetry infrastructure to build this on.

Item 8's team-scale caveat is worth saying plainly: closing the rule
**count** gap to 400 is a multi-year, funded-team endeavor. Closing the
precision **gap** — the one Lyse's own measurement already proved is
real and damaging — is achievable with the machinery above, built on
infrastructure that already exists in this repo today.
