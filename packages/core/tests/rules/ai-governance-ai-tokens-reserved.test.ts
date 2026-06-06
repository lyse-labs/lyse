import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/ai-governance-ai-tokens-reserved.js";
import { detectReservedAiTokens } from "../../src/parsers/ai-tokens.js";
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
  tmp = mkdtempSync(join(tmpdir(), "lyse-ai-tokens-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("rule ai-governance/ai-tokens-reserved", () => {
  it("fixture 1 (none): emits no finding when no token files exist", async () => {
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });

  it("fixture 2 (carbon-style): detects dragon-fruit and *-ai-* tokens in tokens.json", async () => {
    writeFileSync(
      join(tmp, "tokens.json"),
      JSON.stringify({
        "dragon-fruit-01": { $value: "#ff7eb6" },
        "dragon-fruit-02": { $value: "#ff3eb5" },
        "color-ai-brand": { $value: "#8a3ffc" },
        "color-primary": { $value: "#0f62fe" },
      }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe("info");
    expect(result.findings[0]?.axis).toBe("ai-governance");
    expect(result.findings[0]?.ruleId).toBe("ai-governance/ai-tokens-reserved");
    expect(result.findings[0]?.message).toContain("dragon-fruit-01");
    expect(result.opportunities).toBe(1);
  });

  it("fixture 3 (polaris-style): detects magic tokens in CSS custom properties", async () => {
    writeFileSync(
      join(tmp, "tokens.css"),
      [
        ":root {",
        "  --p-color-text-magic: #8a3ffc;",
        "  --p-color-bg-magic-secondary: #f0e6ff;",
        "  --p-color-text: #202223;",
        "}",
      ].join("\n"),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    const msg = result.findings[0]?.message ?? "";
    expect(msg).toContain("magic");
  });

  it("fixture 4 (workday-style): detects *-ai-* segment in YAML token file", async () => {
    mkdirSync(join(tmp, "tokens"), { recursive: true });
    writeFileSync(
      join(tmp, "tokens", "ai.yaml"),
      [
        "color-ai-primary:",
        "  $value: '#6929c4'",
        "color-ai-secondary:",
        "  $value: '#9f1853'",
        "color-neutral:",
        "  $value: '#161616'",
      ].join("\n"),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    const msg = result.findings[0]?.message ?? "";
    expect(msg).toContain("color-ai-primary");
    expect(msg).toContain("color-ai-secondary");
  });

  it("fixture 5 (css-var-style): detects ai-prefixed CSS custom properties", async () => {
    writeFileSync(
      join(tmp, "design.css"),
      [
        ":root {",
        "  --ai-brand-primary: #8a3ffc;",
        "  --ai-surface-bg: #f4f0ff;",
        "  --color-primary: #0f62fe;",
        "}",
      ].join("\n"),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    const msg = result.findings[0]?.message ?? "";
    expect(msg).toContain("--ai-brand-primary");
    expect(msg).toContain("--ai-surface-bg");
    expect(msg).not.toContain("--color-primary");
  });

  it("fixture 6 (none-present): emits no finding when token file has no AI-marker names", async () => {
    writeFileSync(
      join(tmp, "tokens.json"),
      JSON.stringify({
        "color-primary": { $value: "#0f62fe" },
        "color-secondary": { $value: "#393939" },
        "spacing-sm": { $value: "4px" },
      }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
  });

  it("fixture 7 (mixed): detects multiple AI marker families across files", async () => {
    writeFileSync(
      join(tmp, "tokens.json"),
      JSON.stringify({ "dragon-fruit-01": { $value: "#ff7eb6" } }),
    );
    writeFileSync(
      join(tmp, "design.css"),
      ":root { --p-color-text-magic: #8a3ffc; }\n",
    );
    const tokens = detectReservedAiTokens(tmp);
    expect(tokens.some((t) => t.includes("dragon-fruit"))).toBe(true);
    expect(tokens.some((t) => t.includes("magic"))).toBe(true);
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
  });

  it("does not emit when repoRoot is empty string", async () => {
    const ctx: RuleContext = { ...makeCtx(tmp), repoRoot: "" };
    const result = await rule.evaluate(ctx, emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });

  it("respects allowlist directive in README.md", async () => {
    writeFileSync(
      join(tmp, "tokens.json"),
      JSON.stringify({ "color-ai-brand": { $value: "#8a3ffc" } }),
    );
    writeFileSync(
      join(tmp, "README.md"),
      "# DS\n\nlyse-disable ai-governance/ai-tokens-reserved\n",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
  });

  it("respects allowlist directive in .lyse.yaml", async () => {
    writeFileSync(
      join(tmp, "tokens.json"),
      JSON.stringify({ "color-ai-brand": { $value: "#8a3ffc" } }),
    );
    writeFileSync(
      join(tmp, ".lyse.yaml"),
      "# lyse-disable ai-governance/ai-tokens-reserved\n",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
  });
});

describe("_internal helpers", () => {
  it("isAllowlisted returns false when no README exists", () => {
    expect(_internal.isAllowlisted(tmp)).toBe(false);
  });

  it("isAllowlisted returns true when README contains the disable directive", () => {
    writeFileSync(
      join(tmp, "README.md"),
      `# DS\n\n${_internal.DISABLE_DIRECTIVE}\n`,
    );
    expect(_internal.isAllowlisted(tmp)).toBe(true);
  });

  it("DISABLE_DIRECTIVE matches expected string", () => {
    expect(_internal.DISABLE_DIRECTIVE).toBe("lyse-disable ai-governance/ai-tokens-reserved");
  });
});

describe("detectReservedAiTokens helper", () => {
  it("returns empty array when no token sources exist", () => {
    expect(detectReservedAiTokens(tmp)).toEqual([]);
  });

  it("returns sorted, deduplicated token names", () => {
    writeFileSync(
      join(tmp, "tokens.json"),
      JSON.stringify({
        "color-ai-brand": { $value: "#8a3ffc" },
        "color-ai-secondary": { $value: "#9f1853" },
        "color-ai-brand": { $value: "#6929c4" },
      }),
    );
    const tokens = detectReservedAiTokens(tmp);
    const sorted = [...tokens].sort();
    expect(tokens).toEqual(sorted);
    const unique = new Set(tokens);
    expect(unique.size).toBe(tokens.length);
  });

  it("scans nested DTCG token structures", () => {
    writeFileSync(
      join(tmp, "tokens.json"),
      JSON.stringify({
        color: {
          ai: {
            brand: { $value: "#8a3ffc", $type: "color" },
          },
        },
      }),
    );
    const tokens = detectReservedAiTokens(tmp);
    expect(tokens.some((t) => t === "ai")).toBe(true);
  });
});
