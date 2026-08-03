// The held-out corpus: repositories no Lyse rule was calibrated against, pinned
// by SHA and fetched at run time like every other corpus here.
//
// Held out means: absent from lyse-bench tier1 (the calibration set), from the
// local .bench-corpus working directory, and from the golden, generalization and
// negative corpora. That is the whole definition, and it is exactly what
// disjoint.test.ts enforces.
//
// What it does NOT prove: that nobody ever ran Lyse against one of these by hand
// while developing a rule. Nothing in this repository can establish that, and any
// figure published from this corpus carries the caveat.
//
// SHAs come from lyse-bench/corpus/tier2.yaml, resolved 2026-05-23.
// Selection rationale: .superpowers/specs/2026-08-03-heldout-corpus-design.md
import type { GoldenRepo } from "../golden/corpus.js";
import type { NegativeRepo } from "../generalization/negatives.js";

export type Framework = "react" | "vue" | "svelte" | "agnostic";
export type Stack = "css-in-js" | "css-modules" | "tailwind-v3" | "tailwind-v4" | "vanilla-css";
export type Maturity = "early" | "growing" | "mature";

export interface HeldoutRepo extends GoldenRepo {
  framework: Framework;
  stack: Stack;
  maturity: Maturity;
}

export interface HeldoutNegative extends NegativeRepo {
  framework: Framework;
}

const pin = (
  slug: string,
  sha: string,
  label: string,
  framework: Framework,
  stack: Stack,
  maturity: Maturity,
): HeldoutRepo => ({
  slug, sha, label, framework, stack, maturity,
  auditSubpath: ".",
  url: `https://codeload.github.com/${slug}/tar.gz/${sha}`,
});

const negative = (
  slug: string,
  sha: string,
  label: string,
  framework: Framework,
  reason: string,
  auditSubpath = ".",
): HeldoutNegative => ({
  slug, sha, label, framework, reason, auditSubpath,
  url: `https://codeload.github.com/${slug}/tar.gz/${sha}`,
});

export const HELDOUT_CORPUS: HeldoutRepo[] = [
  pin("ant-design/ant-design", "1b0219f3375e27e232c726eeb9fee77bb04be828", "ant-design", "react", "css-in-js", "mature"),
  pin("adobe/react-spectrum", "6ffb87e7d6f9083b3566d881deea5296fb38aa28", "react-spectrum", "react", "css-modules", "mature"),
  pin("tamagui/tamagui", "6d859917ccd3fafe34537ce5edde70a8496a6897", "tamagui", "react", "css-in-js", "growing"),
  // The only tailwind-v4 repository in the candidate pool. Tailwind v4 `@theme`
  // utility generation is item 1 on the labeling protocol's false-positive
  // checklist, so the corpus would have no case for it without this repo.
  pin("origin-space/originui", "839aa2275cc8e1cef543eded62f6255854a76b87", "originui", "react", "tailwind-v4", "early"),
  pin("magicuidesign/magicui", "97fc1bc67f05b83f4a4e0f7727f912199167151e", "magicui", "react", "tailwind-v3", "early"),
  pin("primefaces/primevue", "0394f1e4157de7698048a255a38a9983bf689a34", "primevue", "vue", "css-modules", "mature"),
  pin("quasarframework/quasar", "19dea7f9a6b61374415a29661bfe16d01a9c09b0", "quasar", "vue", "css-modules", "mature"),
  pin("themesberg/flowbite-svelte", "3fbf1a186976dad6cbfbfb31979985829867319e", "flowbite-svelte", "svelte", "tailwind-v3", "growing"),
  pin("adobe/spectrum-web-components", "9f4e60e8533eba8b3edcd8c776a102057e67e393", "spectrum-web-components", "agnostic", "vanilla-css", "mature"),
  pin("chakra-ui/zag", "05a777924c230a2f109aaa9d4cb225ab764562e7", "zag", "agnostic", "vanilla-css", "growing"),
];

// Applications, not design systems. Chosen for the shape that actually fools the
// detector — real components in a real repository — and NOT for being obviously
// unrelated. supabase, n8n and posthog were rejected despite fitting that shape:
// each ships a genuine UI package, so their ground truth is arguable, and an
// arguable negative damages a precision figure more than a missing one does.
export const HELDOUT_NEGATIVES: HeldoutNegative[] = [
  negative(
    "excalidraw/excalidraw", "f6d85bc80fe328e8f472636eb0d541f7bb891aa0", "excalidraw", "react",
    "A whiteboard application. It has components because every application does; it publishes no component library and its packages are the editor's own internals.",
  ),
  // The repo root has no package.json at all — the app lives under webapp/,
  // whose own package.json is the workspace declaration this negative tests.
  negative(
    "mattermost/mattermost", "7e75035cb6766afc8424c7ee299ef4184a249e92", "mattermost", "react",
    "A team-chat application in a workspace monorepo — the exact shape that produced the false positives in issue #269 — whose packages are server, client and plugin code, not a published design system.",
    "webapp",
  ),
  negative(
    "coollabsio/coolify", "49656aa1edbe8aa6f7f7077dbf689cb1a08f05ee", "coolify", "svelte",
    "A self-hosting platform built with SvelteKit. Its `.svelte` files are application routes and views resolved by file path, not an exported component library.",
  ),
  negative(
    "hoppscotch/hoppscotch", "e3853bb76411f1fb8aed96ab78560eb869ee6567", "hoppscotch", "vue",
    "An API client built on Nuxt. Its components are the application's own screens, auto-imported by convention rather than published for anyone else to consume.",
  ),
  negative(
    "umami-software/umami", "c0ea3aefbee7a3429ee2f824b06dc4a9dbe0b7e1", "umami", "react",
    "A web-analytics application. Small, self-contained, single-package, and it exports nothing a second project could install.",
  ),
];

// lyse-bench tier1 — the 20-repo calibration set — frozen here rather than read
// from `../lyse-bench/corpus/tier1.yaml`, because that is a separate repository
// CI does not check out. A disjointness test that silently skips when its input
// is missing is a test that never runs, which this repo has already been bitten
// by. Twenty strings a human can diff is the honest version.
// Source: lyse-bench/corpus/tier1.yaml, read 2026-08-03.
export const CALIBRATION_SLUGS: readonly string[] = [
  "shadcn-ui/ui",
  "mantinedev/mantine",
  "mui/material-ui",
  "chakra-ui/chakra-ui",
  "nextui-org/nextui",
  "radix-ui/primitives",
  "calcom/cal.com",
  "documenso/documenso",
  "vercel/commerce",
  "ariakit/ariakit",
  "tremorlabs/tremor",
  "makeplane/plane",
  "nuxt/ui",
  "element-plus/element-plus",
  "vuetifyjs/vuetify",
  "kobaltedev/kobalte",
  "corvudev/corvu",
  "huntabyte/shadcn-svelte",
  "skeletonlabs/skeleton",
  "tailwindlabs/tailwindcss-typography",
];
