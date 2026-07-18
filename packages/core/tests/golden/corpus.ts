// Third-party sources are cloned at test time, never vendored (LYSE-MISSION ruling 5).
// SHAs: Carbon/Polaris/shadcn reuse the 2026-05-23 lyse-bench pins; cruip resolved fresh at P0.
// Re-pin via PR when bumping (record the audit-number delta in the P0 report + CHANGELOG).
export interface GoldenRepo {
  slug: string;
  url: string;
  sha: string;
  auditSubpath: string; // path within the extracted repo that the bench audited
  label: string;
}

const pin = (slug: string, sha: string, auditSubpath: string, label: string): GoldenRepo => ({
  slug, sha, auditSubpath, label, url: `https://codeload.github.com/${slug}/tar.gz/${sha}`,
});

export const GOLDEN_CORPUS: GoldenRepo[] = [
  pin("carbon-design-system/carbon", "486d06d81fa5a969499de61bcb6ddf8ef4f803cc", "packages/react", "carbon-react"),
  pin("Shopify/polaris", "2b1ea88625e0613853ca8577c9acd1980a90f382", "polaris-react", "polaris-react"),
  pin("shadcn-ui/ui", "4a4dc8eb0fc793d8e9225e780183ad605f15d2c2", ".", "shadcn-ui"),
  pin("cruip/tailwind-dashboard-template", "173f64183e3f5488e8e22d3a3f6a8de75bf63d7a", ".", "tailwind-dashboard"),
];
