import { describe, expect, it } from "vitest";
import { GOLDEN_CORPUS } from "./corpus.js";

describe("golden corpus manifest", () => {
  it("pins four repos by full 40-char SHA with an audit subpath", () => {
    expect(GOLDEN_CORPUS).toHaveLength(4);
    for (const r of GOLDEN_CORPUS) {
      expect(r.sha).toMatch(/^[0-9a-f]{40}$/);
      expect(r.slug).toMatch(/^[\w.-]+\/[\w.-]+$/);
      expect(r.url).toBe(`https://codeload.github.com/${r.slug}/tar.gz/${r.sha}`);
      expect(r.auditSubpath).toBeTypeOf("string");
    }
    expect(GOLDEN_CORPUS.map((r) => r.slug).sort()).toEqual([
      "Shopify/polaris", "carbon-design-system/carbon", "cruip/tailwind-dashboard-template", "shadcn-ui/ui",
    ]);
  });
});
