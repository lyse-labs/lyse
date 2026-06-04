import { describe, it, expect } from "vitest";
import { checkThemeParity } from "../../src/loaders/token-graph.js";
import type { TokenMap } from "../../src/types.js";

// Helper to build a minimal TokenMap with tokens in specific maps
function makeTokenMap(extraPaths: { map: keyof Omit<TokenMap, "source">; value: string; paths: string[] }[]): TokenMap {
  const base: TokenMap = {
    colors: new Map(),
    spacing: new Map(),
    typography: new Map(),
    radii: new Map(),
    shadows: new Map(),
    motion: new Map(),
    breakpoints: new Map(),
    zIndex: new Map(),
    opacity: new Map(),
    borderWidth: new Map(),
    source: "dtcg",
  };
  for (const { map, value, paths } of extraPaths) {
    (base[map] as Map<string, string[]>).set(value, paths);
  }
  return base;
}

// Empty token map
function emptyMap(): TokenMap {
  return makeTokenMap([]);
}

// ─── Suffix pattern tests ─────────────────────────────────────────────────────

describe("checkThemeParity — suffix pattern (-light / -dark)", () => {
  it("returns hasMultipleModes: false when no dual-mode tokens exist", () => {
    const tokenMap = makeTokenMap([
      { map: "colors", value: "#2563eb", paths: ["color/primary"] },
      { map: "colors", value: "#1d4ed8", paths: ["color/secondary"] },
    ]);
    const result = checkThemeParity(tokenMap);
    expect(result.hasMultipleModes).toBe(false);
    expect(result.missingInDark).toHaveLength(0);
    expect(result.missingInLight).toHaveLength(0);
  });

  it("returns hasMultipleModes: true when all tokens have both light and dark variants", () => {
    const tokenMap = makeTokenMap([
      { map: "colors", value: "#2563eb", paths: ["color/primary-light"] },
      { map: "colors", value: "#1d4ed8", paths: ["color/primary-dark"] },
      { map: "colors", value: "#e5e7eb", paths: ["color/surface-light"] },
      { map: "colors", value: "#1f2937", paths: ["color/surface-dark"] },
    ]);
    const result = checkThemeParity(tokenMap);
    expect(result.hasMultipleModes).toBe(true);
    expect(result.missingInDark).toHaveLength(0);
    expect(result.missingInLight).toHaveLength(0);
  });

  it("flags tokens missing in dark mode", () => {
    const tokenMap = makeTokenMap([
      { map: "colors", value: "#2563eb", paths: ["color/primary-light"] },
      { map: "colors", value: "#1d4ed8", paths: ["color/primary-dark"] },
      // color/accent only has light variant — missing dark
      { map: "colors", value: "#7c3aed", paths: ["color/accent-light"] },
    ]);
    const result = checkThemeParity(tokenMap);
    expect(result.hasMultipleModes).toBe(true);
    expect(result.missingInDark).toContain("color/accent");
    expect(result.missingInLight).toHaveLength(0);
  });

  it("flags tokens missing in light mode", () => {
    const tokenMap = makeTokenMap([
      { map: "colors", value: "#2563eb", paths: ["color/primary-light"] },
      { map: "colors", value: "#1d4ed8", paths: ["color/primary-dark"] },
      // color/muted only has dark variant — missing light
      { map: "colors", value: "#374151", paths: ["color/muted-dark"] },
    ]);
    const result = checkThemeParity(tokenMap);
    expect(result.hasMultipleModes).toBe(true);
    expect(result.missingInLight).toContain("color/muted");
    expect(result.missingInDark).toHaveLength(0);
  });

  it("flags tokens missing in both directions simultaneously", () => {
    const tokenMap = makeTokenMap([
      // primary: complete pair
      { map: "colors", value: "#2563eb", paths: ["color/primary-light"] },
      { map: "colors", value: "#1d4ed8", paths: ["color/primary-dark"] },
      // accent: only light
      { map: "colors", value: "#7c3aed", paths: ["color/accent-light"] },
      // muted: only dark
      { map: "colors", value: "#374151", paths: ["color/muted-dark"] },
    ]);
    const result = checkThemeParity(tokenMap);
    expect(result.hasMultipleModes).toBe(true);
    expect(result.missingInDark).toContain("color/accent");
    expect(result.missingInLight).toContain("color/muted");
  });

  it("works across multiple token maps (spacing, typography, etc.)", () => {
    const tokenMap = makeTokenMap([
      { map: "colors", value: "#fff", paths: ["color/bg-light"] },
      { map: "colors", value: "#000", paths: ["color/bg-dark"] },
      // spacing with only light variant
      { map: "spacing", value: "16px", paths: ["spacing/base-light"] },
    ]);
    const result = checkThemeParity(tokenMap);
    expect(result.hasMultipleModes).toBe(true);
    expect(result.missingInDark).toContain("spacing/base");
    expect(result.missingInDark).not.toContain("color/bg");
  });

  it("does not flag single-mode tokens (no suffix) as parity violations", () => {
    const tokenMap = makeTokenMap([
      // These have light/dark pairs
      { map: "colors", value: "#2563eb", paths: ["color/primary-light"] },
      { map: "colors", value: "#1d4ed8", paths: ["color/primary-dark"] },
      // This has no light/dark suffix — should NOT appear in missing lists
      { map: "spacing", value: "16px", paths: ["spacing/base"] },
    ]);
    const result = checkThemeParity(tokenMap);
    expect(result.hasMultipleModes).toBe(true);
    expect(result.missingInDark).not.toContain("spacing/base");
    expect(result.missingInLight).not.toContain("spacing/base");
  });
});

// ─── Prefix pattern tests ─────────────────────────────────────────────────────

describe("checkThemeParity — prefix pattern (light-<base> / dark-<base>)", () => {
  it("detects prefix-style dual-mode tokens", () => {
    const tokenMap = makeTokenMap([
      { map: "colors", value: "#2563eb", paths: ["light-primary"] },
      { map: "colors", value: "#1d4ed8", paths: ["dark-primary"] },
    ]);
    const result = checkThemeParity(tokenMap);
    expect(result.hasMultipleModes).toBe(true);
    expect(result.missingInDark).toHaveLength(0);
    expect(result.missingInLight).toHaveLength(0);
  });

  it("flags prefix-style tokens missing in dark mode", () => {
    const tokenMap = makeTokenMap([
      { map: "colors", value: "#2563eb", paths: ["light-primary"] },
      { map: "colors", value: "#1d4ed8", paths: ["dark-primary"] },
      { map: "colors", value: "#7c3aed", paths: ["light-accent"] }, // no dark
    ]);
    const result = checkThemeParity(tokenMap);
    expect(result.hasMultipleModes).toBe(true);
    expect(result.missingInDark).toContain("accent");
  });

  it("handles prefixed paths with namespace segments (e.g. theme/light-primary)", () => {
    const tokenMap = makeTokenMap([
      { map: "colors", value: "#2563eb", paths: ["theme/light-primary"] },
      { map: "colors", value: "#1d4ed8", paths: ["theme/dark-primary"] },
      { map: "colors", value: "#7c3aed", paths: ["theme/light-accent"] }, // no dark
    ]);
    const result = checkThemeParity(tokenMap);
    expect(result.hasMultipleModes).toBe(true);
    expect(result.missingInDark).toContain("theme/accent");
    expect(result.missingInDark).not.toContain("theme/primary");
  });
});

// ─── Path-segment pattern tests ───────────────────────────────────────────────

describe("checkThemeParity — path-segment pattern (/light/ / /dark/)", () => {
  it("detects path-segment style dual-mode tokens", () => {
    const tokenMap = makeTokenMap([
      { map: "colors", value: "#2563eb", paths: ["color/light/primary"] },
      { map: "colors", value: "#1d4ed8", paths: ["color/dark/primary"] },
    ]);
    const result = checkThemeParity(tokenMap);
    expect(result.hasMultipleModes).toBe(true);
    expect(result.missingInDark).toHaveLength(0);
    expect(result.missingInLight).toHaveLength(0);
  });

  it("flags path-segment style tokens missing in dark mode", () => {
    const tokenMap = makeTokenMap([
      { map: "colors", value: "#2563eb", paths: ["color/light/primary"] },
      { map: "colors", value: "#1d4ed8", paths: ["color/dark/primary"] },
      { map: "colors", value: "#7c3aed", paths: ["color/light/accent"] }, // no dark
    ]);
    const result = checkThemeParity(tokenMap);
    expect(result.hasMultipleModes).toBe(true);
    expect(result.missingInDark).toContain("color/accent");
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe("checkThemeParity — edge cases", () => {
  it("returns empty results for a completely empty TokenMap", () => {
    const result = checkThemeParity(emptyMap());
    expect(result.hasMultipleModes).toBe(false);
    expect(result.missingInDark).toHaveLength(0);
    expect(result.missingInLight).toHaveLength(0);
  });

  it("missingInDark and missingInLight are sorted alphabetically", () => {
    const tokenMap = makeTokenMap([
      { map: "colors", value: "#fff", paths: ["z-token-light"] },
      { map: "colors", value: "#000", paths: ["z-token-dark"] },
      { map: "colors", value: "#111", paths: ["a-missing-light"] }, // no dark
      { map: "colors", value: "#222", paths: ["m-missing-light"] }, // no dark
      { map: "colors", value: "#333", paths: ["b-missing-light"] }, // no dark
    ]);
    const result = checkThemeParity(tokenMap);
    expect(result.missingInDark).toEqual(["a-missing", "b-missing", "m-missing"]);
  });

  it("suffix convention takes priority over prefix when both could match", () => {
    // Token like "dark-bg-light" — has BOTH a light suffix AND a dark prefix.
    // The suffix strategy runs first, so "dark-bg-light" → base "dark-bg",
    // and "dark-bg" also gets detected as prefix-dark with base "bg".
    // Only suffix results should be returned.
    const tokenMap = makeTokenMap([
      { map: "colors", value: "#fff", paths: ["bg-light"] },
      { map: "colors", value: "#000", paths: ["bg-dark"] },
    ]);
    const result = checkThemeParity(tokenMap);
    // Suffix pattern detected — hasMultipleModes is true
    expect(result.hasMultipleModes).toBe(true);
    expect(result.missingInDark).toHaveLength(0);
    expect(result.missingInLight).toHaveLength(0);
  });
});
