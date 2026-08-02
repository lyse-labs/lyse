// Generalization / honesty harness corpus — architecturally-diverse real design
// systems, pinned by SHA and fetched at run time (never vendored), each tagged
// with the DS use-case dimensions it exercises and a per-invariant status.
//
// This is NOT the golden corpus (tests/golden = byte-snapshot regression net).
// Here each (repo × invariant) carries a status:
//   - "enforced"  → a shipped honesty property; asserted in CI (must hold).
//   - "known-gap" → a documented coverage gap; observed + reported, NOT asserted,
//                   so the public suite stays green. Fixing it flips it to
//                   "enforced" (the ratchet).
// Statuses are grounded in the 2026-07-19 coverage sweep + P0/#238 re-validation
// and reconciled against a live run (see harness.test.ts).
//
// Re-pin via PR when bumping a SHA (record any status flip). SHAs resolved
// 2026-07-19 from each repo's default branch, except vuetify and
// shadcn-svelte (added 2026-07-30 — see their own pin comment below).
import type { GoldenRepo } from "../golden/corpus.js";

export type Dimension =
  | "vue"
  | "svelte"
  | "react"
  | "css-class"
  | "tokens-css-vars"
  | "tokens-scss"
  | "tokens-js-theme"
  | "self-ds"
  | "consumer";

export type InvariantId = "C1" | "C2" | "H2" | "H3" | "H4";
export type CheckStatus = "enforced" | "known-gap";

export interface GenRepo extends GoldenRepo {
  dimensions: Dimension[];
  checks: Partial<Record<InvariantId, CheckStatus>>;
}

const pin = (
  slug: string,
  sha: string,
  auditSubpath: string,
  label: string,
  dimensions: Dimension[],
  checks: GenRepo["checks"],
): GenRepo => ({
  slug,
  sha,
  auditSubpath,
  label,
  dimensions,
  checks,
  url: `https://codeload.github.com/${slug}/tar.gz/${sha}`,
});

export const GENERALIZATION_CORPUS: GenRepo[] = [
  pin(
    "element-plus/element-plus",
    "92a65bae89b92e6ba50658c83dd94d785eb44197",
    ".",
    "element-plus",
    ["vue", "self-ds", "tokens-scss"],
    { H2: "enforced", H3: "enforced", C1: "enforced", C2: "enforced", H4: "enforced" },
  ),
  pin(
    "chakra-ui/chakra-ui",
    "f73145383d96be454629dabf4f5220a1388ce8ea",
    ".",
    "chakra",
    ["react", "self-ds", "tokens-js-theme"],
    { H2: "enforced", C2: "enforced", C1: "known-gap", H4: "enforced" },
  ),
  pin(
    "mantinedev/mantine",
    "9dda4cac3da8eab49b9d60181d81a11778223307",
    ".",
    "mantine",
    ["react", "self-ds", "tokens-css-vars"],
    { H2: "enforced", C1: "enforced", C2: "enforced", H4: "enforced" },
  ),
  pin(
    "radix-ui/primitives",
    "f0864ebdd5619bdd8420d006194b13af231f82ab",
    ".",
    "radix",
    ["react", "self-ds"],
    { H2: "enforced", C1: "enforced", C2: "enforced", H4: "enforced" },
  ),
  pin(
    "twbs/bootstrap",
    "6f20e52759a0e0dee2c2f171e9357f3ccca52992",
    ".",
    "bootstrap",
    ["self-ds", "css-class", "tokens-scss"],
    { C1: "enforced", C2: "known-gap", H2: "known-gap", H4: "enforced" },
  ),
  pin(
    "saadeghi/daisyui",
    "374d63758f997317e92e93e547569a5f9ad11250",
    ".",
    "daisyui",
    ["self-ds", "css-class", "tokens-css-vars"],
    { C1: "enforced", C2: "known-gap", H2: "known-gap", H4: "enforced" },
  ),
  pin(
    "carbon-design-system/carbon-components-svelte",
    "2997fb1e0b659b8d2aa1e31aa5be037a2beac62d",
    ".",
    "carbon-svelte",
    ["svelte", "self-ds"],
    { H3: "enforced", C2: "known-gap", H4: "enforced" },
  ),
  pin(
    "cruip/tailwind-dashboard-template",
    "173f64183e3f5488e8e22d3a3f6a8de75bf63d7a",
    ".",
    "tailwind-dashboard",
    ["consumer"],
    { H2: "enforced", H4: "enforced" },
  ),
  // Added Task 7 (evidence-based-ds-detection, 2026-07-30). SHAs resolved from
  // each repo's default branch that day. All four declared checks probed
  // against a live run before pinning as "enforced" (see harness.test.ts's
  // [harness] scorecard output) — evidence-based family detection (this
  // branch) is what makes vuetify and shadcn-svelte resolve a DS family at
  // all; on `main` both report zero components.
  pin(
    "vuetifyjs/vuetify",
    "f23af8a11a74e1a7aadfd8bbcdc8ef674ad6314d",
    ".",
    "vuetify",
    ["vue", "self-ds", "tokens-scss"],
    { C1: "enforced", C2: "enforced", H2: "enforced", H3: "enforced", H4: "enforced" },
  ),
  pin(
    "huntabyte/shadcn-svelte",
    "58d7b9c2aa727963ab127b0ce7d63cf488cf8ef4",
    ".",
    "shadcn-svelte",
    ["svelte", "self-ds", "tokens-css-vars"],
    { C1: "enforced", C2: "enforced", H2: "enforced", H3: "enforced", H4: "enforced" },
  ),
];
