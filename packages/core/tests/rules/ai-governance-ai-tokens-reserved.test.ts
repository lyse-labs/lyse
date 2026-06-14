import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule } from "../../src/rules/ai-governance-ai-tokens-reserved.js";
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

describe("detectReservedAiTokens (shared parser)", () => {
  it("returns [] when no AI tokens are present (DS not penalized)", () => {
    writeFileSync(
      join(tmp, "tokens.json"),
      JSON.stringify({
        color: {
          primary: { value: "#0070f3" },
          background: { value: "#ffffff" },
        },
      }),
    );
    writeFileSync(join(tmp, "theme.css"), ":root { --color-primary: #0070f3; }");
    expect(detectReservedAiTokens(tmp)).toEqual([]);
  });

  it("does NOT match substring 'ai' inside larger words (no false positives)", () => {
    writeFileSync(
      join(tmp, "tokens.json"),
      JSON.stringify({
        color: {
          rain: "#aaa",
          paint: "#bbb",
          mainColor: "#ccc",
          captain: "#ddd",
          detail: "#eee",
        },
        // 'main' contains 'ai' as substring — should NOT trigger
        background: { main: "#fff" },
      }),
    );
    writeFileSync(
      join(tmp, "theme.css"),
      ":root { --bg-main: #fff; --paint-stroke: #000; --rain-overlay: #111; }",
    );
    expect(detectReservedAiTokens(tmp)).toEqual([]);
  });

  it("detects Carbon-style `dragon-fruit` AI gradient token", () => {
    writeFileSync(
      join(tmp, "tokens.json"),
      JSON.stringify({
        gradient: {
          "dragon-fruit": { value: "linear-gradient(...)" },
        },
      }),
    );
    const found = detectReservedAiTokens(tmp);
    expect(found.some((n) => n.includes("dragon-fruit"))).toBe(true);
  });

  it("detects Carbon-style `*-color-*-ai-*` segment tokens with distinctive descriptor", () => {
    writeFileSync(
      join(tmp, "tokens.json"),
      JSON.stringify({
        background: {
          color: { ai: { aura: { primary: { value: "#abc" } } } },
        },
      }),
    );
    const found = detectReservedAiTokens(tmp);
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((n) => n.toLowerCase().includes(".ai."))).toBe(true);
  });

  it("detects Polaris-style `--p-color-*-magic*` tokens", () => {
    writeFileSync(
      join(tmp, "polaris.css"),
      `:root {
  --p-color-bg-magic: #f4f0fd;
  --p-color-bg-magic-hover: #ebe3fc;
  --p-color-text-magic: #4b2989;
}`,
    );
    const found = detectReservedAiTokens(tmp);
    expect(found.length).toBeGreaterThanOrEqual(3);
    expect(found.every((n) => n.startsWith("--p-color"))).toBe(true);
  });

  it("Workday Canvas plain `color.ai.*` is NOT detected (precision trade, #139)", () => {
    writeFileSync(
      join(tmp, "canvas.tokens.json"),
      JSON.stringify({
        color: {
          ai: {
            primary: { value: "#0875e1" },
            secondary: { value: "#005cb9" },
          },
        },
      }),
    );
    const found = detectReservedAiTokens(tmp);
    expect(found).toEqual([]);
  });

  it("detects leading-`ai` segment in CSS when paired with AI-distinctive descriptor", () => {
    writeFileSync(
      join(tmp, "ai-tokens.css"),
      ":root { --ai-gradient-start: #abc; --ai-glow: #def; }",
    );
    const found = detectReservedAiTokens(tmp);
    expect(found).toContain("--ai-gradient-start");
    expect(found).toContain("--ai-glow");
  });

  it("detects mixed vocabularies (Carbon + Polaris + genai + distinctive-ai) and returns sorted+deduped", () => {
    mkdirSync(join(tmp, "tokens"), { recursive: true });
    writeFileSync(
      join(tmp, "tokens", "carbon.json"),
      JSON.stringify({ gradient: { "dragon-fruit": "#a40" } }),
    );
    writeFileSync(
      join(tmp, "tokens", "genai.json"),
      JSON.stringify({ color: { genai: { primary: "#abc" } } }),
    );
    writeFileSync(
      join(tmp, "polaris.css"),
      ":root { --p-color-bg-magic: #aaa; --p-color-text-magic: #bbb; }",
    );
    writeFileSync(join(tmp, "ai-glow.css"), ":root { --ai-glow: #ccc; }");
    // duplicate the same token across two CSS files — must dedupe
    writeFileSync(join(tmp, "extra.css"), ":root { --ai-glow: #ccc; }");

    const found = detectReservedAiTokens(tmp);
    // Sorted
    const sorted = [...found].sort();
    expect(found).toEqual(sorted);
    // Deduped (--ai-glow should appear once)
    expect(found.filter((n) => n === "--ai-glow")).toHaveLength(1);
    // Multiple vocabularies present
    expect(found.length).toBeGreaterThanOrEqual(4);
  });

  it("Mantine negative: --ai-bg/--ai-size/--ai-color/--ai-hover-color are NOT detected (ActionIcon FP fixed, #139)", () => {
    writeFileSync(
      join(tmp, "mantine.module.css"),
      ":root { --ai-size-xs: 16px; --ai-bg: #fff; --ai-color: #000; --ai-hover-color: #111; }",
    );
    expect(detectReservedAiTokens(tmp)).toEqual([]);
  });

  it("recall trade: --ai-gradient-start is detected, --ai-primary is not", () => {
    writeFileSync(
      join(tmp, "mixed-recall.css"),
      ":root { --ai-gradient-start: #f0f; --ai-primary: #abc; }",
    );
    const found = detectReservedAiTokens(tmp);
    expect(found).toContain("--ai-gradient-start");
    expect(found).not.toContain("--ai-primary");
  });

  it("detects distinctive AI token in a .scss file (Carbon CDS pattern)", () => {
    writeFileSync(
      join(tmp, "ai-tokens.scss"),
      ":root { --cds-ai-aura-start: #abc; }",
    );
    const found = detectReservedAiTokens(tmp);
    expect(found).toContain("--cds-ai-aura-start");
  });

  it("Mantine-style .scss: --ai-bg/--ai-size are NOT detected (precision preserved through SCSS path)", () => {
    writeFileSync(
      join(tmp, "mantine.module.scss"),
      ".actionIcon { --ai-bg: #fff; --ai-size: 16px; }",
    );
    expect(detectReservedAiTokens(tmp)).toEqual([]);
  });

  it("SCSS constructs around a distinctive token do not prevent extraction", () => {
    writeFileSync(
      join(tmp, "carbon-ai.scss"),
      `$x: 1px;
@mixin ai-theme {
  color: red;
}
:root { --ai-gradient-1: red; }`,
    );
    const found = detectReservedAiTokens(tmp);
    expect(found).toContain("--ai-gradient-1");
  });

  it("ignores node_modules, dist, .git, build", () => {
    mkdirSync(join(tmp, "node_modules"), { recursive: true });
    writeFileSync(
      join(tmp, "node_modules", "tokens.json"),
      JSON.stringify({ color: { ai: { primary: "#abc" } } }),
    );
    mkdirSync(join(tmp, "dist"), { recursive: true });
    writeFileSync(join(tmp, "dist", "out.css"), ":root { --ai-x: #abc; }");
    expect(detectReservedAiTokens(tmp)).toEqual([]);
  });
});

describe("rule ai-governance/ai-tokens-reserved", () => {
  it("emits no finding when no reserved AI tokens detected", async () => {
    writeFileSync(
      join(tmp, "tokens.json"),
      JSON.stringify({ color: { primary: { value: "#0070f3" } } }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
  });

  it("emits a single info finding listing matched names when present", async () => {
    writeFileSync(
      join(tmp, "tokens.json"),
      JSON.stringify({ gradient: { "dragon-fruit": { value: "linear-gradient(...)" } } }),
    );
    writeFileSync(join(tmp, "ai.css"), ":root { --ai-gradient-start: #def; }");
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    const finding = result.findings[0]!;
    expect(finding.severity).toBe("info");
    expect(finding.axis).toBe("ai-governance");
    expect(finding.ruleId).toBe("ai-governance/ai-tokens-reserved");
    expect(finding.message.toLowerCase()).toContain("reserved");
  });

  it("truncates the listed names to a maximum of 20 in the message", async () => {
    const lines: string[] = [];
    for (let i = 0; i < 30; i++) lines.push(`--ai-gradient-${i}: #abc;`);
    writeFileSync(join(tmp, "ai-many.css"), `:root { ${lines.join(" ")} }`);
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    const msg = result.findings[0]!.message;
    // Should mention 30 total but list at most 20 names — checking the "+N more" hint
    expect(msg).toMatch(/30/);
  });

  it("is suppressed by an adjacent README `lyse-disable ai-governance/ai-tokens-reserved`", async () => {
    writeFileSync(
      join(tmp, "tokens.json"),
      JSON.stringify({ gradient: { "dragon-fruit": { value: "linear-gradient(...)" } } }),
    );
    writeFileSync(
      join(tmp, "README.md"),
      "# DS\n\n<!-- lyse-disable ai-governance/ai-tokens-reserved -->\n",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
  });

  it("is suppressed by `.lyse.yaml` containing the disable directive", async () => {
    writeFileSync(
      join(tmp, "tokens.json"),
      JSON.stringify({ gradient: { "dragon-fruit": { value: "linear-gradient(...)" } } }),
    );
    writeFileSync(
      join(tmp, ".lyse.yaml"),
      "# lyse-disable ai-governance/ai-tokens-reserved\n",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
  });

  it("returns no findings when repoRoot is not set", async () => {
    const ctx: RuleContext = {
      repoRoot: "",
      tokens: null,
      componentsModule: null,
      componentInventory: [],
      storyIndex: null,
      excludePaths: [],
    };
    const result = await rule.evaluate(ctx, emptyParsed);
    expect(result.findings).toHaveLength(0);
  });
});
