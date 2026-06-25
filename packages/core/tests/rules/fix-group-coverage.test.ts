import { describe, it, expect } from "vitest";
import { ruleObjects } from "../../src/rules/registry.js";
import { rule as spacingRule } from "../../src/rules/tokens-no-hardcoded-spacing.js";
import { rule as radiusRule } from "../../src/rules/tokens-no-hardcoded-border-radius.js";
import { rule as borderWidthRule } from "../../src/rules/tokens-no-hardcoded-border-width.js";
import { rule as mediaQueryRule } from "../../src/rules/tokens-no-hardcoded-media-query.js";
import { rule as motionRule } from "../../src/rules/tokens-no-hardcoded-motion.js";
import { rule as opacityRule } from "../../src/rules/tokens-no-hardcoded-opacity.js";
import { rule as shadowRule } from "../../src/rules/tokens-no-hardcoded-shadow.js";
import { rule as typographyRule } from "../../src/rules/tokens-no-hardcoded-typography.js";
import { rule as zIndexRule } from "../../src/rules/tokens-no-hardcoded-z-index.js";
import { rule as colorRule } from "../../src/rules/tokens-no-hardcoded-color.js";
import { rule as gradientRule } from "../../src/rules/tokens-no-hardcoded-gradient.js";
import type { ParsedFiles, RuleContext, TokenMap } from "../../src/types.js";

const VALUE_DRIFT_RULE_IDS = [
  "tokens/no-hardcoded-color", "tokens/no-hardcoded-spacing", "tokens/no-hardcoded-border-radius",
  "tokens/no-hardcoded-border-width", "tokens/no-hardcoded-gradient", "tokens/no-hardcoded-media-query",
  "tokens/no-hardcoded-motion", "tokens/no-hardcoded-opacity", "tokens/no-hardcoded-shadow",
  "tokens/no-hardcoded-typography", "tokens/no-hardcoded-z-index",
] as const;

function makeCtx(tokens: TokenMap): RuleContext {
  return { repoRoot: "/x", tokens, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] };
}

function emptyTokens(overrides: Partial<TokenMap> = {}): TokenMap {
  return {
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
    ...overrides,
  } as unknown as TokenMap;
}

function css(source: string): ParsedFiles {
  return { ts: [], css: [{ path: "a.css", source, root: null }], cssInJs: [] };
}

describe("value-drift rules expose fixGroup support", () => {
  it("every listed rule is registered", () => {
    const ids = new Set(ruleObjects.map((r) => r.id));
    for (const id of VALUE_DRIFT_RULE_IDS) expect(ids.has(id)).toBe(true);
  });
});

describe("fixGroup emission — per-rule assertions", () => {
  // spacing: isOnScale checks spacing.has(String(numericValue)) e.g. "16",
  // but spacingFixGroup looks up spacing.get(raw) i.e. "16px" first.
  // A map keyed by "16px" is therefore off-scale (isOnScale misses it) but
  // resolvable — so `to` can be asserted here.
  it("spacing: emits fixGroup with from='16px' (full literal) and resolves to single token", async () => {
    const ctx = makeCtx(emptyTokens({ spacing: new Map([["16px", ["space.4"]]]) }));
    const { findings } = await spacingRule.evaluate(ctx, css(".x { padding: 16px; }"));
    const fg = findings.find((f) => f.fixGroup)?.fixGroup;
    expect(fg).toBeDefined();
    expect(fg).toMatchObject({ from: "16px", to: "space.4" });
  });

  // For rules where the scale check and fixGroup lookup share the exact same
  // map key, a value in the map is on-scale and skipped. We use a value absent
  // from the map (off-scale → finding emitted) and assert from; to is
  // undefined because there are no candidates for an off-scale value.

  it("border-radius: emits fixGroup with from='6px' (off-scale, no to)", async () => {
    const ctx = makeCtx(emptyTokens());
    const { findings } = await radiusRule.evaluate(ctx, css(".x { border-radius: 6px; }"));
    const fg = findings.find((f) => f.fixGroup)?.fixGroup;
    expect(fg).toBeDefined();
    expect(fg?.from).toBe("6px");
    expect(fg?.to).toBeUndefined();
  });

  it("border-width: emits fixGroup with from='3px' (off-scale, no to)", async () => {
    const ctx = makeCtx(emptyTokens());
    const { findings } = await borderWidthRule.evaluate(ctx, css(".x { border-width: 3px; }"));
    const fg = findings.find((f) => f.fixGroup)?.fixGroup;
    expect(fg).toBeDefined();
    expect(fg?.from).toBe("3px");
    expect(fg?.to).toBeUndefined();
  });

  it("media-query: emits fixGroup with from='640px' (off-scale, no to)", async () => {
    const ctx = makeCtx(emptyTokens());
    const { findings } = await mediaQueryRule.evaluate(ctx, css("@media (min-width: 640px) { .x { color: red; } }"));
    const fg = findings.find((f) => f.fixGroup)?.fixGroup;
    expect(fg).toBeDefined();
    expect(fg?.from).toBe("640px");
    expect(fg?.to).toBeUndefined();
  });

  it("motion: emits fixGroup with from='300ms' (off-scale, no to)", async () => {
    const ctx = makeCtx(emptyTokens());
    const { findings } = await motionRule.evaluate(ctx, css(".x { transition-duration: 300ms; }"));
    const fg = findings.find((f) => f.fixGroup)?.fixGroup;
    expect(fg).toBeDefined();
    expect(fg?.from).toBe("300ms");
    expect(fg?.to).toBeUndefined();
  });

  it("opacity: emits fixGroup with from='0.5' (off-scale, no to)", async () => {
    const ctx = makeCtx(emptyTokens());
    const { findings } = await opacityRule.evaluate(ctx, css(".x { opacity: 0.5; }"));
    const fg = findings.find((f) => f.fixGroup)?.fixGroup;
    expect(fg).toBeDefined();
    expect(fg?.from).toBe("0.5");
    expect(fg?.to).toBeUndefined();
  });

  it("shadow: emits fixGroup with raw from (off-scale, no to)", async () => {
    const ctx = makeCtx(emptyTokens());
    const { findings } = await shadowRule.evaluate(ctx, css(".x { box-shadow: 0px 2px 4px rgba(0,0,0,0.1); }"));
    const fg = findings.find((f) => f.fixGroup)?.fixGroup;
    expect(fg).toBeDefined();
    expect(fg?.from).toBe("0px 2px 4px rgba(0,0,0,0.1)");
    expect(fg?.to).toBeUndefined();
  });

  it("typography: emits fixGroup with from='14px' (off-scale, no to)", async () => {
    const ctx = makeCtx(emptyTokens());
    const { findings } = await typographyRule.evaluate(ctx, css(".x { font-size: 14px; }"));
    const fg = findings.find((f) => f.fixGroup)?.fixGroup;
    expect(fg).toBeDefined();
    expect(fg?.from).toBe("14px");
    expect(fg?.to).toBeUndefined();
  });

  it("z-index: emits fixGroup with from='400' (off-scale, no to)", async () => {
    const ctx = makeCtx(emptyTokens());
    const { findings } = await zIndexRule.evaluate(ctx, css(".x { z-index: 400; }"));
    const fg = findings.find((f) => f.fixGroup)?.fixGroup;
    expect(fg).toBeDefined();
    expect(fg?.from).toBe("400");
    expect(fg?.to).toBeUndefined();
  });

  // color: no on-scale skip — all hardcoded literals are flagged, so having the
  // value in the map gives both a finding and a resolved `to`.
  it("color: emits fixGroup with from='#3b82f6' and resolves to single token", async () => {
    const ctx = makeCtx(emptyTokens({ colors: new Map([["#3b82f6", ["color.blue.500"]]]) }));
    const { findings } = await colorRule.evaluate(ctx, css(".x { color: #3b82f6; }"));
    const fg = findings.find((f) => f.fixGroup)?.fixGroup;
    expect(fg).toBeDefined();
    expect(fg).toMatchObject({ from: "#3b82f6", to: "color.blue.500" });
  });

  // Gradient is composite: the function name ("linear-gradient") is not a
  // scalar token value — no reverse-lookup exists. Collapsing distinct
  // gradients under one key would produce a misleading "1 fix · N sites" group.
  it("gradient: emits NO fixGroup (composite value, no scalar token reverse-lookup)", async () => {
    const ctx = makeCtx(emptyTokens());
    const { findings } = await gradientRule.evaluate(ctx, css(".x { background: linear-gradient(90deg, #f00, #00f); }"));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => f.fixGroup === undefined)).toBe(true);
  });
});
