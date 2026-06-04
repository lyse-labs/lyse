import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/tokens-description-coverage.js";
import type { RuleContext, ParsedFiles } from "../../src/types.js";

const emptyParsed: ParsedFiles = { ts: [], css: [], cssInJs: [] };

function makeCtx(repoRoot: string): RuleContext {
  return {
    repoRoot,
    tokens: null,
    componentsModule: null,
    componentInventory: [],
    storyIndex: null,
    excludePaths: [],
  };
}

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "lyse-desc-coverage-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("rule tokens/description-coverage", () => {
  it("emits 0 findings at 100% coverage", async () => {
    writeFileSync(
      join(tmp, "design.tokens.json"),
      JSON.stringify({
        action: {
          primary: { $value: "#2563eb", $type: "color", $description: "Primary CTA color" },
          secondary: { $value: "#64748b", $type: "color", $description: "Secondary action color" },
        },
      }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(2);
  });

  it("emits 1 finding mentioning 0% when no semantic tokens have descriptions", async () => {
    writeFileSync(
      join(tmp, "design.tokens.json"),
      JSON.stringify({
        action: {
          primary: { $value: "#2563eb", $type: "color" },
          secondary: { $value: "#64748b", $type: "color" },
          tertiary: { $value: "#888", $type: "color" },
        },
      }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.message).toContain("0%");
    expect(result.findings[0]?.severity).toBe("info");
  });

  it("emits 0 findings at exactly 80%", async () => {
    // 5 semantic tokens, 4 described → 80% (threshold is exclusive of failure)
    const tokens: Record<string, unknown> = {};
    for (let i = 0; i < 5; i++) {
      tokens[`t${i}`] = i < 4
        ? { $value: "#fff", $type: "color", $description: `desc ${i}` }
        : { $value: "#fff", $type: "color" };
    }
    writeFileSync(
      join(tmp, "design.tokens.json"),
      JSON.stringify({ action: tokens }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(5);
  });

  it("emits 1 finding at 79.999% coverage", async () => {
    // 1000 semantic tokens, 799 described → 79.9% < 80%
    const tokens: Record<string, unknown> = {};
    for (let i = 0; i < 1000; i++) {
      tokens[`t${i}`] = i < 799
        ? { $value: "#fff", $type: "color", $description: `desc ${i}` }
        : { $value: "#fff", $type: "color" };
    }
    writeFileSync(
      join(tmp, "design.tokens.json"),
      JSON.stringify({ action: tokens }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.opportunities).toBe(1000);
  });

  it("returns N/A (0 findings, 0 opportunities) when no DTCG file is present", async () => {
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });

  it("excludes primitive tokens from the denominator", async () => {
    writeFileSync(
      join(tmp, "design.tokens.json"),
      JSON.stringify({
        // Primitives — excluded
        color: {
          blue: { "500": { $value: "#2563eb", $type: "color" } },
          red: { "500": { $value: "#ef4444", $type: "color" } },
        },
        spacing: {
          "16": { $value: "16px", $type: "dimension" },
        },
        // Semantic — counted (1 of 1 described → 100%)
        action: {
          primary: { $value: "{color.blue.500}", $type: "color", $description: "Primary CTA" },
        },
      }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(1); // only the 1 semantic token counts
  });

  it("counts tokens under 'semantic.*' group", async () => {
    writeFileSync(
      join(tmp, "design.tokens.json"),
      JSON.stringify({
        semantic: {
          primary: { $value: "#fff", $type: "color" },
          secondary: { $value: "#fff", $type: "color" },
        },
      }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.opportunities).toBe(2);
  });

  it("ignores files without a DTCG-shaped tree", async () => {
    writeFileSync(
      join(tmp, "config.tokens.json"),
      JSON.stringify({ name: "lyse", version: "0.1.0" }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });
});

describe("internal helpers", () => {
  it("isSemanticTokenPath recognizes known semantic prefixes", () => {
    expect(_internal.isSemanticTokenPath(["action", "primary"])).toBe(true);
    expect(_internal.isSemanticTokenPath(["surface", "raised"])).toBe(true);
    expect(_internal.isSemanticTokenPath(["semantic", "brand"])).toBe(true);
    expect(_internal.isSemanticTokenPath(["text", "muted"])).toBe(true);
    expect(_internal.isSemanticTokenPath(["color", "blue", "500"])).toBe(false);
    expect(_internal.isSemanticTokenPath(["spacing", "16"])).toBe(false);
  });

  it("walkForCoverage counts semantic tokens and described ones", () => {
    const stats = _internal.walkForCoverage({
      color: { blue: { "500": { $value: "#fff", $type: "color" } } }, // primitive, excluded
      action: {
        primary: { $value: "#fff", $type: "color", $description: "desc" },
        secondary: { $value: "#fff", $type: "color" },
      },
    });
    expect(stats.semanticCount).toBe(2);
    expect(stats.semanticWithDescription).toBe(1);
  });
});
