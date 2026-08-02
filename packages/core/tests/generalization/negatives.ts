// Repositories that are NOT design systems, pinned by SHA and fetched at run
// time like every other corpus here.
//
// Why this file exists: `.bench-corpus` and both test corpora are made of design
// systems, so every precision number computed on them is computed with no way to
// be wrong. Detection could return "yes, design system" for every repository on
// earth and score perfectly. These are the cases where the correct answer is
// **no**, and they are the only thing that makes a false positive visible.
//
// Chosen for the shape that actually fools the detector — a private workspace
// monorepo whose packages hold real `.tsx` — not for being obviously unrelated.
// A repository with zero component-shaped files proves nothing.
import type { GoldenRepo } from "../golden/corpus.js";

export interface NegativeRepo extends GoldenRepo {
  /** Why a human says this is not a design system. Ground truth, stated once. */
  reason: string;
}

const pin = (
  slug: string,
  sha: string,
  label: string,
  reason: string,
): NegativeRepo => ({
  slug, sha, label, reason, auditSubpath: ".",
  url: `https://codeload.github.com/${slug}/tar.gz/${sha}`,
});

export const NEGATIVE_CORPUS: NegativeRepo[] = [
  pin(
    "usebruno/bruno",
    "2b2512e56db3e82e53d3bbb9a34c62615907bcbd",
    "bruno",
    "An API client. `packages/bruno-app` is its React UI — an application, not a " +
      "published component library — and no package in the workspace is a design system.",
  ),
  pin(
    "vitejs/vite",
    "e6b6b167afa0a80548829d1f24a0712f9194389a",
    "vite",
    "A build tool. The only component-shaped files in `create-vite` are project " +
      "templates it copies into new repositories; they are not Vite's own components.",
  ),
  pin(
    "nrwl/nx",
    "e232342ae73c67f262e07633b88a8bb344456457",
    "nx",
    "A monorepo build system. Its `.tsx` files are generator templates and e2e " +
      "fixtures, not a component library.",
  ),
  pin(
    "vercel/commerce",
    "3761e52e60df9c6a316e067dbfd7032e494d3634",
    "commerce",
    "A Next.js storefront application. It has components because every app does; " +
      "it publishes none and is not a workspace.",
  ),
];
