# DS + AI Coverage Universe — the authoritative denominator

> **Status:** v1.1 (living). This document is the **coverage denominator** for Lyse and the
> `autonomous-validation-engine`. It enumerates the universe of verifiable design-system +
> AI-UX checks, anchored on **named external authorities** and **de-facto tool conventions**,
> and maps Lyse's current coverage against each.
>
> **Provenance:** synthesized from 7 adversarially-verified research sweeps (DTCG, WCAG/ACT/APG,
> HAX/PAIR/Carbon/IBM, EU AI Act, USWDS, Cloudscape gen-AI, stylelint/jsx-a11y linter inventories,
> W3C i18n/bidi, Style Dictionary native transforms, data-viz a11y, Vale/textlint, MJML, Alexa/Google
> conversational, UICrit/HEQS/HAX-Workbook expert-evaluation methods). Two sub-areas remain
> **under-sourced** and are flagged inline: the full axe-core rule catalogue (~90+ beyond the
> ACT-mapped 27+14) and the WCAG 2.2 new-SC automatability split.

## Why this document exists

"Cover every DS + AI scope in the world, forgetting nothing" is **not a finite enumerable set** —
standards evolve (WCAG 2.2→2.3, EU AI Act in force Aug 2026), and a large share of UX/governance
quality is subjective. The rigorous, honest substitute is this document: every check family is
traced to **an authoritative source, a de-facto convention, or explicitly flagged as having no
stable source**, and tagged by the **oracle** that could validate it. Coverage is then a
*verifiable claim against named authorities*, not a claim of absolute completeness.

## Legends

**Oracle type** (determines autonomous-validation feasibility):
- `CONSTRUCTION` — label comes from a programmatic mutation; fully autonomous, non-circular.
- `EXECUTION` — browser/runtime/build produces the truth (CSSOM, axe-core, bundler).
- `CROSS-TOOL` — an independent tool/source agrees (stylelint, Figma API, tsc).
- `METAMORPHIC` — equivalence invariants; consistency without external truth.
- `PROXY` — matcher-coherence only; validates the matcher fires, NOT construct validity.
- `JUDGMENT` — no oracle; subjective quality. Report-only forever.

**Lyse status:**
- 🟢 SCORED — rule exists and contributes to the Health Score.
- 🟡 UNSCORED — rule exists but experimental / report-only.
- 🔴 ABSENT — no rule; not covered.

**Engine impact** (`autonomous-validation-engine`):
- ✅ FULL — recall + precision measured, metamorphic-checked, fix-loop improvable.
- 🟡 RECALL — recall validated, precision surfaced but capped (natural look-alikes).
- 🔶 PROXY — only matcher-coherence provable.
- ⚪ NONE — judgment / not-yet-built; engine cannot validate.

**Source quality:** `PRIMARY` (spec/standard/law), `DEFACTO` (linter/tool convention),
`NONE` (no stable authoritative source — honest gap).

---

# PART I — DESIGN SYSTEM

## Axis A — Design Tokens (DTCG)

Authoritative source: **DTCG Design Tokens Format Module 2025.10** (first STABLE version — a W3C
Community Group Report, _not_ a W3C Recommendation). Fully mechanical → `CONSTRUCTION` oracle.

| Sub-axis | Distinct checks | Source | Oracle | Lyse | Engine |
|---|---|---|---|---|---|
| A1 Token conformance | `$value` mandatory; `$type` required-unless-inherited; closed set of **13 types** (color, dimension, fontFamily, fontWeight, duration, cubicBezier, number, strokeStyle, border, transition, shadow, gradient, typography); `$value`+children mutual-exclusion (~16-20 checks) | PRIMARY | CONSTRUCTION | 🟢 partial (dtcg-conformance) | ✅ |
| A2 Naming rules | name MUST NOT begin with `$`; MUST NOT contain `{ } .` | PRIMARY | CONSTRUCTION | 🔴 | ✅ (to build) |
| A3 Reference integrity | alias `{group.token}` resolves to target `$value`; alias chaining; **circular-reference detection (MUST)**; JSON Pointer (`$ref`/RFC 6901) support; `$extends` deep-merge inheritance (~4-5 checks) | PRIMARY | CONSTRUCTION | 🔴 | ✅ (to build) |
| A4 Description/metadata | `$description` coverage; `$extensions`; `$deprecated` marker presence | PRIMARY (optional fields) | CONSTRUCTION | 🟢 description-coverage, deprecated-token-usage | ✅ |
| A5 Theming / modes | light/dark/high-contrast/multi-brand mode coverage; mode parity | **NONE** (DTCG does NOT mandate theming) | CONSTRUCTION (presence) / EXECUTION (rendered) | 🟢 theme-modes-present, css-custom-property-export | ✅ presence / ⚪ rendered |

> **Honest gap A5:** theming/modes has no stable normative source. Checks rest on de-facto
> Style Dictionary / Tokens Studio "modes" conventions. _[research wf_4649b157-9cc pending — depth]_

## Axis B — Token adoption / hardcoded values

Source: **DEFACTO** (stylelint `declaration-strict-value`, design-token linters). Oracle
`CONSTRUCTION` for recall; precision capped by natural look-alikes (`#fff` in a `var()` fallback,
code examples, palette data) → `METAMORPHIC` + `CROSS-TOOL` (stylelint) needed for precision.

| Sub-axis (one per value family) | Source | Oracle | Lyse | Engine |
|---|---|---|---|---|
| color | DEFACTO | CONSTRUCTION+METAMORPHIC | 🟡 tokens/color | 🟡 |
| spacing | DEFACTO | CONSTRUCTION+METAMORPHIC | 🟢 tokens/spacing | 🟡 |
| typography (size/weight/lh/ls/family) | DEFACTO | CONSTRUCTION | 🟢 no-hardcoded-typography | 🟡 |
| radii | DEFACTO | CONSTRUCTION | 🟢 no-hardcoded-radii | 🟡 |
| shadow | DEFACTO | CONSTRUCTION | 🟡 no-hardcoded-shadow | 🟡 |
| motion (duration + easing) | DEFACTO | CONSTRUCTION | 🟢 no-hardcoded-motion-* | 🟡 |
| breakpoints / media-query widths | DEFACTO | CONSTRUCTION | 🟢 no-hardcoded-media-query, responsive-breakpoints | 🟡 |
| z-index | DEFACTO | CONSTRUCTION | 🟢 no-hardcoded-z-index | 🟡 |
| opacity | DEFACTO | CONSTRUCTION | 🟢 no-hardcoded-opacity | 🟡 |
| border-width | DEFACTO | CONSTRUCTION | 🟢 no-hardcoded-border-width | 🟡 |
| gradient | DEFACTO | CONSTRUCTION | 🟡 no-hardcoded-gradient | 🟡 |

## Axis C — Accessibility

Sources: **WCAG 2.1/2.2** (PRIMARY), **W3C ACT Rules registry** (PRIMARY — axe-core: 27 WCAG-2
rules + 14 proposed), **ARIA APG** (PRIMARY — 32 patterns). **Honest fact:** only **~16/50 (~30%)
WCAG 2.1 AA SC are automatable**; the cited "57%" is a vendor by-volume metric, not criteria coverage.

| Sub-axis | Distinct checks | Source | Oracle | Lyse | Engine |
|---|---|---|---|---|---|
| C1 Automatable WCAG (static) | image alt, form labels, name/role/value, lang, ARIA validity, etc. (~16 SC) | PRIMARY | EXECUTION (Lyse: static subset via jsx-a11y) | 🟢 a11y/essentials, html-lang, semantic-html | ✅ (static-injectable) |
| C2 ARIA APG patterns | **32 patterns** (Accordion…Treegrid) — structural role/keyboard checks | PRIMARY | EXECUTION/CONSTRUCTION (partial) | 🔴 (~0) | ✅ partial (to build) |
| C3 Reduced motion / forced colors / focus-visible | `prefers-reduced-motion` guard; `forced-colors` guard; `:focus-visible` adoption | PRIMARY/DEFACTO | CONSTRUCTION (presence) | 🟢 prefers-reduced-motion, forced-colors, focus-visible | ✅ |
| C4 Inclusive language | blocklist (whitelist/blacklist/master-slave…) | DEFACTO | CONSTRUCTION | 🟢 inclusive-language | ✅ |
| C5 Manual WCAG (~34 SC) | focus order, keyboard nav, meaningful sequence, sensory, etc. | PRIMARY | JUDGMENT/EXECUTION-partial | 🔴 | ⚪ |
| C6 WCAG 2.2 new SC | 2.4.11 Focus Not Obscured, 2.5.7 Dragging, 2.5.8 Target Size, 3.2.6 Consistent Help, 3.3.7 Redundant Entry, 3.3.8 Accessible Auth | PRIMARY | mixed (some EXECUTION) | 🔴 | 🟡 _[research pending — automatability]_ |
| C7 Computed contrast | rendered text/non-text contrast ratio | PRIMARY | EXECUTION (oracle has known FPs) | 🔴 | 🟡 (to build) |

## Axis D — Components / API quality

Source: **NONE** authoritative (DEFACTO: eslint-plugin-jsx-a11y, TS conventions). Oracle `CONSTRUCTION`/AST.

| Sub-axis | Source | Oracle | Lyse | Engine |
|---|---|---|---|---|
| Naming (component PascalCase, hook `use`, prop camelCase) | DEFACTO | CONSTRUCTION/AST | 🟢 naming-* | ✅ |
| Doc comments on exports | DEFACTO | CONSTRUCTION/AST | 🟢 doc-comments | ✅ |
| Typed prop contracts / strictness | DEFACTO | AST + JUDGMENT (strictness graded) | 🟡 contracts-strictness | ⚪ |
| SVG viewBox / decorative aria / no icon-fonts / native shadow | DEFACTO | CONSTRUCTION/AST | 🟢 svg-viewbox, icon-decorative-aria, no-icon-fonts, no-native-shadows | ✅ |
| Full prop-convention denominator | DEFACTO | CONSTRUCTION | 🔴 partial | 🟡 (to build) |

**Verified de-facto linter denominator** (the addressable convention universe Lyse can target):
- `eslint-plugin-jsx-a11y` — static AST checker on JSX (~30-40 rules; exact count unverified). Pure CONSTRUCTION oracle.
- `stylelint-a11y` — **exactly 12 CSS-level rules**: content-property-no-static-value, font-size-is-readable, line-height-is-vertical-rhythmed, media-prefers-reduced-motion, media-prefers-color-scheme, no-display-none, no-obsolete-attribute, no-obsolete-element, no-spread-text, no-outline-none, no-text-align-justify, selector-pseudo-class-focus. CONSTRUCTION.
- `stylelint-declaration-strict-value` — **1 configurable rule** enforcing tokens over literals, regex property targeting (`/color$/` → color/background-color/border-color). The de-facto token-enforcement mechanism (used by Atlassian DS). CONSTRUCTION.
- Storybook a11y addon — **re-runs axe-core**, no distinct catalogue (EXECUTION).

## Axis E — Documentation / Stories

| Sub-axis | Source | Oracle | Lyse | Engine |
|---|---|---|---|---|
| Story coverage (component → has story) | DEFACTO (Storybook) | CONSTRUCTION (cross-file) | 🟢 stories/coverage | ✅ |
| Variant coverage (props → story args) | DEFACTO | CONSTRUCTION | 🟡 stories/variant-coverage | ✅ |
| Doc presence per component | DEFACTO | CONSTRUCTION | 🟢 doc-comments | ✅ |

## Axis F — Versioning / lifecycle

Source: **NONE** authoritative (DEFACTO: SemVer, EightShapes versioning conventions).

| Sub-axis | Source | Oracle | Lyse | Engine |
|---|---|---|---|---|
| Changelog present + structured | DEFACTO | CONSTRUCTION | 🟢 changelog-present | ✅ |
| SemVer compliance | semver.org (PRIMARY) | CONSTRUCTION | 🟢 semver-versioning | ✅ |
| Migration guide present | DEFACTO | CONSTRUCTION | 🟢 migration-guide-present | ✅ |
| Deprecation markers (`@deprecated`) | DEFACTO | CONSTRUCTION | 🟢 deprecation-markers | ✅ |

## Axis G — Internationalization / RTL / bidi

Sources: **W3C i18n** (PRIMARY: `authoring-html`, `inline-bidi-markup`), de-facto linters.
**Honest tension:** W3C does **not** mandate logical-over-physical CSS for direction — frame
logical-vs-physical as a de-facto linter convention, not a W3C requirement. And direction MUST NOT
be inferred from language (so "RTL content missing dir" is hard to flag reliably).

| Sub-axis | Distinct checks | Source | Oracle | Lyse | Engine |
|---|---|---|---|---|---|
| G1 Hardcoded strings vs i18n | eslint-plugin-i18next `no-literal-string` (flags `<div>hello</div>`, allows `{t('KEY')}`) | DEFACTO | CONSTRUCTION/AST | 🔴 | ✅ (to build) |
| G2 Logical vs physical CSS (RTL-safety) | `stylelint-use-logical` (1 rule: `margin-left`→`margin-inline-start`…); `stylelint-plugin-logical-css` (3 rules: require-logical-properties/keywords/units) | DEFACTO | CONSTRUCTION | 🔴 | ✅ (to build) |
| G3 `lang` on `<html>` (BCP47) | W3C H57 / WCAG 3.1.1 | PRIMARY | CONSTRUCTION | 🟢 html-lang | ✅ |
| G4 `dir` (ltr/rtl/auto) + `bdi` for runtime content | W3C inline-bidi-markup (wrap every opposite-direction phrase) | PRIMARY | CONSTRUCTION | 🔴 | ✅ (to build) |
| G5 Locale-aware formatting | — | NONE | JUDGMENT/EXECUTION | 🔴 | ⚪ |

## Axis H — Responsive / fluid / container queries

| Sub-axis | Source | Oracle | Lyse | Engine |
|---|---|---|---|---|
| Container queries vs media queries | CSS MQ L5 (PRIMARY) | CONSTRUCTION | 🟢 container-query | ✅ |
| Tokenized breakpoints | DEFACTO | CONSTRUCTION | 🟢 responsive-breakpoints | ✅ |
| Fluid type (clamp) | DEFACTO | CONSTRUCTION | 🔴 | ✅ (to build) |

## Axis I — Adoption / consistency / performance _(not covered)_

| Sub-axis | Oracle | Lyse | Engine |
|---|---|---|---|
| DS components used vs re-implemented one-offs | CONSTRUCTION (import graph) | 🟡 usageCount (raw) | ✅ (to build) |
| Cross-repo / monorepo token consistency | METAMORPHIC | 🔴 | ✅ (to build) |
| Bundle / perf budget | EXECUTION (bundler) | 🔴 | ✅ (to build) |

## Axis J — Visual / rendered-value drift _(not covered — highest-value new scope)_

| Sub-axis | Oracle | Lyse | Engine |
|---|---|---|---|
| Rendered color == token value (CSSOM canonicalizes sRGB→rgb()) | EXECUTION | 🔴 | ✅ (to build; oklch/lab need extra logic) |
| Rendered length == token (2em→32px) | EXECUTION | 🔴 | ✅ (to build) |
| Visual regression (screenshot diff) | EXECUTION (detects change, not correctness) | 🔴 | 🟡 |

## Axis K — Figma ↔ code drift _(not covered)_

| Sub-axis | Source | Oracle | Lyse | Engine |
|---|---|---|---|---|
| Token value: Figma variables == code tokens | Figma REST API (Enterprise) | CROSS-TOOL | 🔴 | 🟡 (dependency + Enterprise-gated) |
| Node ↔ component semantic equivalence | Code Connect (human-asserted, no drift detection) | JUDGMENT | 🔴 | ⚪ irreducible |

---

# PART II — AI-UX GOVERNANCE

Convergent authorities: **Microsoft HAX** (18 guidelines G1-G18, PRIMARY), **Google PAIR** (6
chapters, PRIMARY), **IBM Carbon for AI** (AI label + explainability popover *required*, PRIMARY),
**IBM Research** (6 generative-AI principles, PRIMARY), **EU AI Act Art. 50** (PRIMARY, in force
2 Aug 2026). Most AI-UX items are `PROXY`/`JUDGMENT`; few are structurally checkable.
_[research wf_4649b157-9cc pending — AWS Cloudscape / Salesforce / Apple HIG ML additions]_

## Axis L — AI-readiness surface (Lyse-pioneered; emerging, no external authority)

| Sub-axis | Source | Oracle | Lyse | Engine |
|---|---|---|---|---|
| llms.txt structure | NONE (emerging) | CONSTRUCTION | 🟢 llms-txt-structure | ✅ |
| AGENTS.md quality | NONE | CONSTRUCTION | 🟢 agents-md-quality | ✅ |
| MCP config present | NONE | CONSTRUCTION | 🟢 mcp-config-present | ✅ |
| Component manifest JSON | NONE | CONSTRUCTION/schema | 🟢 component-manifest-json | ✅ |
| DS index exported | NONE | CONSTRUCTION | 🟢 ds-index-exported | ✅ |
| shadcn registry valid | DEFACTO | CONSTRUCTION/schema | 🟢 shadcn-registry-valid | ✅ |
| Agent instruction files | NONE | CONSTRUCTION | 🟢 agent-instruction-files | ✅ |

## Axis M — AI marking & identity

| Sub-axis | Source | Oracle | Lyse | Engine |
|---|---|---|---|---|
| AI label / marker component present | **Carbon for AI** (required), EU AI Act 50(1) | PROXY (Lyse vocab); structural possible | 🟢 ai-marker-component-present | 🔶 |
| Bot / non-human identity labeling | HAX G1 / de-facto | PROXY | 🟢 bot-identity-labeling | 🔶 |
| Anti-patterns (sparkle-only, button labeled "AI") | DEFACTO | PROXY | 🟡 ai-marker-anti-patterns | 🔶 |
| Disclaimer present | EU AI Act 50(1), GitLab/de-facto | PROXY | 🟡 disclaimer-present | 🔶 |

## Axis N — AI explainability & trust

Sources: HAX G11 ("make clear why"), PAIR Explainability+Trust, IBM "Appropriate Trust & Reliance".

| Sub-axis | Oracle | Lyse | Engine |
|---|---|---|---|
| Explainability affordance (Why/Sources) | PROXY | 🟡 explainability-affordance | 🔶 |
| Source attribution / citation | PROXY → **structural** | 🟢 source-attribution-present | 🔶 → ✅ |
| Confidence / uncertainty indicator | PROXY | 🟢 confidence-indicator-present | 🔶 |

> **Cloudscape upgrade (PRIMARY, structurally detectable):** AWS Cloudscape prescribes a concrete,
> markup-checkable citation affordance — **numbered inline `[1][2][3]` citations triggering
> source-title popovers + an expandable "Sources" section** (title/description/publish-date). This
> turns "source attribution" from a vocabulary proxy into a **CONSTRUCTION** check (presence of the
> citation popover + Sources component), one of the few AI-UX items with a real structural oracle.

## Axis O — AI control & feedback

Sources: HAX G15-G17, PAIR Feedback+Control.

| Sub-axis | Oracle | Lyse | Engine |
|---|---|---|---|
| Human-control affordances (stop/regenerate/edit/reject) | PROXY | 🟡 human-control-affordances | 🔶 |
| Feedback controls (thumbs/rating) | PROXY | 🟢 feedback-control-present | 🔶 |
| Product analytics on AI controls | DEFACTO | PROXY | 🟢 product-analytics | 🔶 |

## Axis P — AI safety & failure

Sources: HAX G7/G8 ("support efficient correction/dismissal"), PAIR Errors + Graceful Failure.

| Sub-axis | Oracle | Lyse | Engine |
|---|---|---|---|
| Loading / generating / error states | **Cloudscape** (PRIMARY) | PROXY → **structural** | 🟢 ai-loading-error-states | 🔶 → ✅ |
| Live-region for streamed AI content | WAI-ARIA + **Cloudscape** (PRIMARY) | PROXY → **structural** | 🟢 ai-content-live-region | 🔶 → ✅ |

> **Cloudscape upgrade (PRIMARY, structurally detectable):** (a) **staged loading taxonomy** —
> avatar+loading-text (processing) → incremental streaming text (generation) → loading bar for
> non-text artifacts (tables, code); (b) **AI-chat a11y structure** — `role="region"` + meaningful
> `aria-label`, new messages announced via a visually-hidden `LiveRegion`. Both are CONSTRUCTION
> checks in markup. _Note: Cloudscape's thumbs-up/down feedback affordance was NOT verified — do
> not treat feedback controls as a Cloudscape-mandated detectable check._

## Axis Q — AI governance docs & process

Source: IBM "Design Responsibly", PAIR worksheets.

| Sub-axis | Oracle | Lyse | Engine |
|---|---|---|---|
| Value-gate governance doc present | DEFACTO | CONSTRUCTION (file presence) | 🟡 value-gate-doc-present | ✅ |
| Interaction-pattern docs | DEFACTO | CONSTRUCTION (doc presence) | 🟢 interaction-pattern-docs | ✅ |
| Draft attribution convention | DEFACTO | PROXY | 🟢 draft-attribution | 🔶 |

## Axis R — AI token governance (Lyse-pioneered)

| Sub-axis | Oracle | Lyse | Engine |
|---|---|---|---|
| Reserved AI tokens declared | CONSTRUCTION (injectable) | 🟡 ai-tokens-reserved | 🟡 |
| AI token misuse (used outside AI surface) | CONSTRUCTION (injectable cross-file) | 🟢 ai-token-misuse | 🟡 |
| AI token requires marker | AST CONSTRUCTION (recall-failing) | 🟡 ai-token-requires-marker | 🔶 |

## Axis S — AI legal / transparency _(not covered)_

| Sub-axis | Source | Oracle | Lyse | Engine |
|---|---|---|---|---|
| Machine-readable synthetic-content marking (C2PA / watermark / fingerprint) | **EU AI Act 50(2)** (PRIMARY, 2 Aug 2026) | CROSS-TOOL/RUNTIME PROXY | 🔴 | 🟡 (proxy, evolving Code of Practice) |
| AI-interaction disclosure (50(1)) | EU AI Act (PRIMARY) | PROXY | 🟡 disclaimer-present (partial) | 🔶 |
| Deepfake disclosure (50(4), deployer duty) | EU AI Act (PRIMARY) | JUDGMENT (editorial exemption) | 🔴 | ⚪ |

## Axis T — AI quality / safety testing _(not covered — judgment/data)_

| Sub-axis | Oracle | Lyse | Engine |
|---|---|---|---|
| Model cards / eval docs present | CONSTRUCTION (presence) | 🔴 | ✅ (to build) |
| Responsible-AI / bias / fairness | JUDGMENT/DATA | 🔴 | ⚪ |
| Prompt-injection / AI feature security | JUDGMENT/EXECUTION | 🔴 | ⚪ |
| Co-creation / generative-variability / mental-models (IBM/PAIR) | JUDGMENT | 🔴 | ⚪ |

---

# PART III — Non-web domains

The doc was web/CSS/React-centric. These domains extend the denominator. Pattern holds: *structure*
is mechanizable, *semantic quality* stays judgment. NB: Style Dictionary / MJML / Vale are
generators/validators, not conformance linters — Lyse must **build** the check by reusing their logic.

## Axis U — Cross-platform / native tokens

| Sub-axis | Source | Oracle | Lyse | Engine |
|---|---|---|---|---|
| Naming-transform conformance (camel/kebab/snake/constant/pascal/human) | Style Dictionary (DEFACTO) | CONSTRUCTION | 🔴 | ✅ (to build) |
| Native value formats (iOS UIColor/SwiftUI, Android Compose/hex8) | Style Dictionary (DEFACTO) | CONSTRUCTION | 🔴 | ✅ (to build) |
| Platform unit correctness (sp for fontSize, dp for dimension) | Style Dictionary (DEFACTO) | CONSTRUCTION | 🔴 | ✅ (to build) |
| Cross-platform component parity (iOS↔Android props/states) | **NONE** | — | 🔴 | ⚪ open question |

> DTCG is **not** authoritative for native (restricts units to px/rem; 13 types are platform-agnostic; pt/dp/sp delegated to translation tools).

## Axis V — Data-visualization

| Sub-axis | Source | Oracle | Lyse | Engine |
|---|---|---|---|---|
| No color-only encoding (WCAG 1.4.1) + "view as data table" present | WCAG (PRIMARY) | STRUCTURAL | 🔴 | ✅ (to build) |
| Non-text contrast 3:1 incl. adjacent slices (1.4.11) | WCAG (PRIMARY) | EXECUTION/CROSS-TOOL | 🔴 | 🟡 (oracle FPs) |
| Text/label contrast (1.4.3) + chart text alternative (1.1.1) | WCAG (PRIMARY) | CROSS-TOOL/STRUCTURAL | 🔴 | ✅/🟡 |
| Palette taxonomy present (sequential/categorical/diverging) | Carbon (DEFACTO) | STRUCTURAL (presence/grouping only) | 🔴 | 🔶 |
| CVD-safe palette **values** / fixed hex | **NONE** (refuted) | JUDGMENT/CROSS-TOOL-sim | 🔴 | ⚪ |

## Axis W — Content / UX-writing

| Sub-axis | Source | Oracle | Lyse | Engine |
|---|---|---|---|---|
| Terminology / capitalization / banned-phrase / inclusive-language | Vale (11 extension points), textlint (DEFACTO) | CROSS-TOOL | 🟡 inclusive-language (subset) | ✅ (adopt linter) |
| Readability metric | Vale (DEFACTO) | CROSS-TOOL | 🔴 | ✅ |
| Voice & tone | **NONE** | JUDGMENT | 🔴 | ⚪ |

> No single authoritative catalogue — the *mechanism* (linter) is solid, the *what-to-check* is decentralized/editorial.

## Axis X — Conversational / Voice UI + Email

| Sub-axis | Source | Oracle | Lyse | Engine |
|---|---|---|---|---|
| Alexa interaction-model schema validity | Amazon SMAPI (PRIMARY) | CONSTRUCTION/schema | 🔴 | ✅ (to build) |
| Conversational component + error-handling presence | Google Conversation Design (DEFACTO) | STRUCTURAL | 🔴 | 🔶 |
| Email component/attribute conformance | MJML 3-level validator (DEFACTO) | CONSTRUCTION | 🔴 | ✅ (to build) |
| Email dark-mode / a11y / client-render | **NONE** (not established) | — | 🔴 | ⚪ open |
| Conversational quality / VUI tone | **NONE** | JUDGMENT | 🔴 | ⚪ |

## Axis Y — Motion (depth)

| Sub-axis | Source | Oracle | Lyse | Engine |
|---|---|---|---|---|
| Motion token-type validity (duration ms/s, cubicBezier 4-array) | DTCG (PRIMARY) | CONSTRUCTION | 🟡 no-hardcoded-motion | ✅ |
| prefers-reduced-motion guard | WCAG/de-facto | CONSTRUCTION | 🟢 prefers-reduced-motion | ✅ |
| WCAG 2.3.3 Animation from Interactions / choreography | PRIMARY (not corroborated this round) | EXECUTION/JUDGMENT | 🔴 | 🟡 open |

---

# PART IV — Autonomous expansion layer (how the engine reaches MORE scopes)

The honest answer to "expert subagents to cover the no-oracle cases": they make the flow autonomous
**in operation**, and they GROW the addressable set — but they do **not** turn judgment into truth.
Three tiers, each with a different, evidence-backed role.

## Tier 3a — Discovery (judgment-looking → mechanizable). The real win.

Specialized expert subagents mine codified expert practice and PROPOSE new candidate checks; each
candidate passes the **oracle gate** (construction/execution) before admission. Evidence it works:
- **Domain-adapted heuristics beat generic** — Langevin CHI 2021: domain-specific conversational
  heuristics found **2× more issues** than generic Nielsen (0.42 vs 0.19, p<0.05). → specialized
  subagents-per-domain is empirically justified, not just intuition.
- **Codified expert sources exist to mine**: HAX Workbook, PAIR worksheets, Microsoft RAI Impact
  Assessment (5 sections, enumerated sub-items), Carbon component checklist (token + a11y gates),
  HEQS (quantified evaluation), UICrit (3,059 expert critiques). These decompose "good design/AI-UX"
  into discrete items — the raw material for discovery.
- Many decompose into items that ARE oracle-able (e.g. Carbon "no magic numbers / non-tokenized
  colors" = a no-hardcoded-value rule; "4.5:1 / 3:1 contrast" = a cross-tool oracle).

→ This tier legitimately pushes the addressable frontier toward more scopes. **Use subagents HERE.**

## Tier 3b — Grounded-advisory (subjective, but calibrated). Useful, bounded.

For checks that stay subjective, a panel grounded (RAG) on the authoritative rubrics emits a score +
confidence; conformal/selective → emit only on high agreement, else abstain; **always labeled
advisory, never in the trusted score.** Evidence on the ceiling:
- **Grounding measurably helps**: few-shot on expert critique data improved LLM design judgment
  **+55%** (0.31→0.48, UICrit).
- **But the gap to human experts persists**: best grounded LLM critique 0.48 vs **0.75** human
  expert. Grounded LLM judgment = *better opinion*, NOT truth.
- **Panels attenuate, don't eliminate** correlated errors (prior sweeps: ~60% agreement when both
  wrong; 9 judges ≈ 2 effective votes; panel ≠ better than best single judge). Report kappa as
  *confidence*, never as validity.

→ Autonomous in operation; epistemically still opinion. Honest only as advisory + abstention.

## Tier 3c — Irreducible judgment. Never autonomous-as-truth.

Taste, brand-fit, editorial appropriateness, voice/tone, CVD-safe palette *values*, conversational
quality. No oracle, no stable source, experts themselves diverge. The system may OFFER a view; it
**certifies nothing**. Surfaced for the human, flagged opinion.

**The rule:** point subagents at **3a (discovery → grow the oracle-able set)**, not at faking an
oracle for 3c. Pointed at discovery they extend coverage legitimately; pointed at certifying taste
they reintroduce the circularity the engine exists to kill.

---

# PART V — Coverage roll-up

## By oracle tier (the only honest denominator)

| Tier | Universe (approx, this doc) | Lyse covers | Engine validates |
|---|---|---|---|
| CONSTRUCTION (fully autonomous) | ~70-90 checks | ~30 | ✅ ~36 |
| EXECUTION (runtime oracle) | ~50-60 checks | ~5 (static subset) | 🟡 to build |
| PROXY (matcher-coherence) | ~15-20 checks | ~14 | 🔶 ~14 |
| JUDGMENT (no oracle, report-only) | unbounded (~half of total) | ~7 (Layer-4 dims) | ⚪ none |

## Honest headline numbers

- **Engine vs Lyse today:** validates ~48/63 rules (~76%).
- **Lyse vs addressable universe** (CONSTRUCTION+EXECUTION+PROXY, ~150-180 checks): ~27%.
- **Addressable-universe target with the oracle roadmap:** **~80%** (achievable — gaps within
  addressable are oracle-fallible: contrast FPs, APG nuance, AI Act proxy, RTL semantics).
- **Vs total universe (judgment included):** ~10-15% today → ~40-50% absolute ceiling (the
  judgment half is **excluded by design** via abstention, not failed).

## What "sans rien oublier" means here, precisely

1. Every check family above traces to **PRIMARY**, **DEFACTO**, or an explicit **NONE** flag.
2. The engine's **completeness gate** (Task 12) fails CI if any registry rule is neither
   oracle-covered nor classified `JUDGMENT` with a reason — no existing rule slips through.
3. New scopes enter only through an **oracle-gated discovery loop**: a candidate check is admitted
   only if it passes the construction-oracle gate (Youden's J ≥ threshold) against lyse-bench.

## Closed in v1.0

- ✅ Ecosystem AI: **AWS Cloudscape** adds 3 structurally-detectable affordances (numbered
  citations + Sources, staged loading taxonomy, chat `role=region`+`LiveRegion`) — upgrades
  Axes N/P from proxy toward structural. Salesforce/Apple HIG ML/Adobe Spectrum produced **no
  verified distinct detectable affordance** beyond Cloudscape in this round.
- ✅ De-facto linter denominators: `eslint-plugin-jsx-a11y` (AST oracle), `stylelint-a11y` (12
  rules), `stylelint-declaration-strict-value` (1 rule), Storybook a11y (= axe-core). (Axis D)
- ✅ i18n / RTL / bidi: 5 sub-axes grounded (Axis G).

## Remaining under-sourced (honest — do NOT fabricate counts)

- Full **axe-core catalogue** (~90+ rules beyond ACT-mapped 27+14): assumed, not verified. Pull
  the live list from `dequelabs/axe-core/doc/rule-descriptions.md` at build time.
- **WCAG 2.2 new SC** automatability split (2.4.11, 2.5.7, 2.5.8, 3.2.6, 3.3.7, 3.3.8): per-criterion
  static-vs-execution-vs-manual not resolved. (Axis C6)
- Motion/theming-mode depth beyond `media-prefers-reduced-motion` + `media-prefers-color-scheme`
  (the two confirmed stylelint-a11y checks): container-queries-vs-media, `clamp()` fluid type,
  high-contrast/forced-colors completeness, Tokens Studio theme-mode parity. (Axes A5, H)
- **Refuted — must NOT enter the denominator:** Cloudscape feedback-thumbs as mandated; jsx-a11y
  "exactly 43 rules"; axe-core "57% hard ceiling"; W3C "CSS must not control direction" /
  per-paragraph-dir-required / flag-physical-CSS-for-RTL.
