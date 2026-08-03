# Labeling protocol v1

The contract every labeler — human or agent — must follow when deciding whether a Lyse
finding is true. **Pre-registered:** this file is frozen before a labeling round starts and
may not be edited during one. Changing it starts a new round with a new version number.

> **Status: pre-registered, not yet runnable. No round has been run.**
>
> The [corpus rule](#corpus-rule) requires a held-out corpus. This repository has only
> `.bench-corpus`, which is the calibration set the protocol forbids labeling on, so no
> round can start today. Nothing in the codebase consumes this file or the `label-*`
> agents yet.
>
> It is committed *before* a round exists on purpose: a protocol written after seeing the
> numbers is not a pre-registration. Building the held-out corpus is the blocking next step.

## Why this exists

Until now every precision number in `reliability/catalogue/sub-axes.ts` came from
`reliability/measure/auto-label.ts`, whose type is literally
`{ verdict: "tp" | "fp"; source: "auto"; reason: string }` — there is no human label path.
Worse, several auto-labelers duplicate the rule's own detection logic (the rule and its
labeler share a copy-pasted `CHANGELOG_CANDIDATES` list), so the labeler inherits the rule's
blind spot and can never disagree with it.

That is how 50 of the 66 sub-axes came to carry `precisionMeasured: 1` — 46 of them
justified by nothing more than `deterministicValidator: true`, and 43 of them feeding the
Health Score — and how `ai-surface.changelog-present` carried a Wilson lower bound of 0.901
that, in the catalogue's own words, "was never measured against a labelled set". That rule
reported "No structured CHANGELOG found" on element-plus, which ships `CHANGELOG.en-US.md`.

Every figure above is countable from `sub-axes.ts` at the commit this version was frozen at;
the quoted type is `auto-label.ts:12`, and the duplicated candidate list is
`auto-label.ts:35` against `rules/versioning-changelog-present.ts:10`.

**A labeler that shares the rule's logic is not a measurement.** This protocol exists to make
labels independent of the thing being measured.

## What is being labeled

The **finding**, not the code. The question is never "is this code good?" It is:

> Is this finding, exactly as worded, true at exactly this location, and would a competent
> engineer on this codebase agree it should be changed?

A finding can be technically true and still be `fp` if its message asserts something false
about the location (wrong rule, wrong suggestion, wrong file).

## Verdicts

| Verdict | Meaning |
|---|---|
| `tp` | True and actionable. You opened the file, the cited evidence is there, and the message is accurate. |
| `fp` | False. Either the evidence is not there, or it is there but is not a violation for this repository, or the message misdescribes it. |
| `unverifiable` | You could not establish either. **Use this freely.** It is never counted in precision. Guessing is a protocol violation. |

There is no fourth verdict. Do not invent severity opinions, do not rewrite the finding.

## Mandatory evidence

Every label carries evidence or it is void.

- `tp` → the quoted source line, with `file:line`.
- `fp` → the **disproof**: the usage that contradicts a "dead"/"unused" claim, the convention
  that makes the pattern legitimate, or the quoted line showing the finding cites something
  that is not there.
- `unverifiable` → what you checked and what stopped you.

## The false-positive checklist — run it before every `tp`

A finding is `fp` if any of these is true. This list is the accumulated set of real mistakes
found in this project; it is not hypothetical.

1. **Utility generation.** A token is "used" through a generated utility class, not a
   `var()` reference. Tailwind v4 `@theme` turns `--animate-slide-in` into `animate-slide-in`.
2. **Framework convention.** The file is resolved by name, not by import — Nuxt/Next
   `layouts/`, `pages/`, `app/` routes, Vue/Nuxt auto-imports, Svelte/SvelteKit routes,
   Angular NgModule declarations, `customElements.define`.
3. **Non-JSX usage.** The component is called as a plain function, passed as a value,
   wrapped in `memo`/`forwardRef`/`styled`, or rendered via `createElement`.
4. **Re-export.** Reached through a barrel, an aliased re-export
   (`X as Y` → `<Namespace.Y>`), or `package.json` `exports`.
5. **Variant selector, not a value.** `data-[state=open]`, `group-data-[…]`, `aria-[…]`,
   `has-[…]`, `@min-[…]` are Tailwind *variants*. They are not arbitrary design values.
6. **Name collision.** The symbol comes from a third-party package that happens to share a
   name with a DS component (`Label` from recharts vs the DS `Label`).
7. **Wrong scope.** The finding is in a zone that should not be audited: vendored code,
   generated output, a starter template, `.test.*`, `.stories.*`, or an example app.
8. **Monorepo blindness.** The artifact the rule wants exists — in a workspace package, not at
   the repository root (CHANGELOG, migration guide, llms.txt, AGENTS.md).
9. **Intentional divergence.** A documented, deliberate exception: a marketing one-off, a
   third-party wrapper matching an external API, an accessibility override, an animation value.
10. **Non-existent target.** The finding describes a file, directory, or repository that does
    not exist, or reports a count derived from zero extracted evidence.

## Independence rules

1. **Never read the auto-label.** If a candidate row carries `labelSource: "auto"` or a
   `reason`, ignore it. Form your verdict from the source only.
2. **Never read another labeler's verdict** during a round.
3. **Never read the rule's implementation.** You may read its user-facing message and its
   `meta.rationale` — that is what a user sees. Reading the detection code makes you inherit
   its blind spot, which is the exact failure this protocol exists to prevent.
4. **Label in your own lens only.** If a finding is outside your specialty, return
   `unverifiable` with a one-line reason. Do not stretch.

## Provenance — non-negotiable

Every label records `source`:

- `human` — a person decided.
- `agent:<persona>` — an expert agent decided.
- `auto` — legacy machine label. **Deprecated. Never counts toward a published number.**

**An agent label may never, on its own, promote a rule into the score.** A rule reaches
`contributesToScore: true` only when: (a) every labeler in the round agreed, **and** (b) a
human signed off on the full disagreement set for that rule. Agreement without human sign-off
caps a rule at `status: beta` — reported, never scored, never blocking.

Rationale: agents labeling the set that measures agents is the same circularity as a rule
labeling itself. Multiple independent lenses reduce it; only a human breaks it. What agents
legitimately buy is speed — they pre-stage a fully-evidenced proposal so the human decides in
seconds instead of hours, and they surface exactly the cases where the humans' attention is
worth spending: the disagreements.

## Round output

Per round: the protocol version, the corpus commit SHAs, the rule set, per-labeler verdicts
with evidence, pairwise agreement rates, the disagreement queue, and the human sign-off.
Precision is reported as a Wilson 95% lower bound with N, **alongside coverage** — how many
findings were labelable at all. A precision figure without its coverage figure is not a result.

## Corpus rule

Labeling runs on the **held-out** corpus only. `.bench-corpus/` is the calibration set; any
number measured there is in-sample and must be labeled as such wherever it is published.
