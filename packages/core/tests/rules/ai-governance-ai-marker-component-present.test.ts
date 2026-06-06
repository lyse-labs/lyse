import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/ai-governance-ai-marker-component-present.js";
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
  tmp = mkdtempSync(join(tmpdir(), "lyse-ai-marker-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Fixture 1: AILabel exported from index
// ---------------------------------------------------------------------------
describe("fixture: AILabel exported", () => {
  it("emits an info finding naming the component", async () => {
    writeFileSync(
      join(tmp, "index.ts"),
      "export { AILabel } from './ai-label';\nexport { Button } from './button';\n",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    const f = result.findings[0]!;
    expect(f.severity).toBe("info");
    expect(f.axis).toBe("ai-governance");
    expect(f.ruleId).toBe("ai-governance/ai-marker-component-present");
    expect(f.message).toContain("AILabel");
    expect(result.opportunities).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Fixture 2: GenAI avatar component
// ---------------------------------------------------------------------------
describe("fixture: GenAIAvatar exported", () => {
  it("emits an info finding for GenAIAvatar", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(
      join(tmp, "src/index.ts"),
      "export { GenAIAvatar } from './gen-ai-avatar';\nexport { Input } from './input';\n",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe("info");
    expect(result.findings[0]?.message).toContain("GenAIAvatar");
  });
});

// ---------------------------------------------------------------------------
// Fixture 3: Polaris magic-* component file
// ---------------------------------------------------------------------------
describe("fixture: Polaris magic-button component file", () => {
  it("emits an info finding when a magic-* component file is found", async () => {
    mkdirSync(join(tmp, "components"), { recursive: true });
    writeFileSync(join(tmp, "components/magic-button.tsx"), "export function MagicButton() { return null; }\n");
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe("info");
    expect(result.findings[0]?.message).toContain("magic-button");
  });
});

// ---------------------------------------------------------------------------
// Fixture 4: marker missing but tokens present (warning)
// ---------------------------------------------------------------------------
describe("fixture: tokens present but no marker component", () => {
  it("emits a warning when AI tokens exist but no marker is exported", async () => {
    mkdirSync(join(tmp, "tokens"), { recursive: true });
    writeFileSync(
      join(tmp, "tokens/ai.tokens.json"),
      JSON.stringify({ "--color-ai-blue": "#0050E6" }),
    );
    writeFileSync(
      join(tmp, "index.ts"),
      "export { Button } from './button';\nexport { Card } from './card';\nexport { Modal } from './modal';\n",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    const f = result.findings[0]!;
    expect(f.severity).toBe("warning");
    expect(f.message).toContain("Reserved AI tokens are present");
    expect(f.message).toContain("no AI-marker component");
    expect(result.opportunities).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Fixture 5: no AI surface (no tokens, no marker) — no finding
// ---------------------------------------------------------------------------
describe("fixture: no AI surface", () => {
  it("emits no finding when there are no AI tokens and no marker", async () => {
    writeFileSync(
      join(tmp, "index.ts"),
      "export { Button } from './button';\nexport { Card } from './card';\nexport { Modal } from './modal';\n",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Fixture 6: allowlist via README disable directive
// ---------------------------------------------------------------------------
describe("fixture: allowlisted via README", () => {
  it("suppresses all findings when README contains the disable directive", async () => {
    mkdirSync(join(tmp, "tokens"), { recursive: true });
    writeFileSync(
      join(tmp, "tokens/ai.tokens.json"),
      JSON.stringify({ "--color-ai-primary": "#000" }),
    );
    writeFileSync(
      join(tmp, "README.md"),
      `# DS\n\n<!-- lyse-disable ai-governance/ai-marker-component-present -->\n`,
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Fixture 7: AIBadge in declaration (not re-export)
// ---------------------------------------------------------------------------
describe("fixture: AIBadge as declared export", () => {
  it("emits an info finding for an AIBadge function declaration", async () => {
    writeFileSync(
      join(tmp, "index.ts"),
      "export function AIBadge() { return null; }\nexport function Button() { return null; }\n",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe("info");
    expect(result.findings[0]?.message).toContain("AIBadge");
  });
});

// ---------------------------------------------------------------------------
// Fixture 8: star re-export — treated as potential marker presence (no warning)
// ---------------------------------------------------------------------------
describe("fixture: star re-export from index", () => {
  it("does not emit a warning when index uses star re-export (opaque surface)", async () => {
    writeFileSync(
      join(tmp, "index.ts"),
      "export * from './components';\n",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    // Star re-exports may include a marker — we treat them as presence.
    expect(result.findings.filter((f) => f.severity === "warning")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// No repoRoot guard
// ---------------------------------------------------------------------------
describe("edge case: no repoRoot", () => {
  it("emits no findings when repoRoot is empty", async () => {
    const ctx: RuleContext = { ...makeCtx(tmp), repoRoot: "" };
    const result = await rule.evaluate(ctx, emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// _internal unit tests
// ---------------------------------------------------------------------------
describe("_internal.isMarkerName", () => {
  it("returns true for canonical AI-marker names", () => {
    expect(_internal.isMarkerName("AILabel")).toBe(true);
    expect(_internal.isMarkerName("AiLabel")).toBe(true);
    expect(_internal.isMarkerName("AIBadge")).toBe(true);
    expect(_internal.isMarkerName("AITag")).toBe(true);
    expect(_internal.isMarkerName("AIIndicator")).toBe(true);
    expect(_internal.isMarkerName("GenAIAvatar")).toBe(true);
    expect(_internal.isMarkerName("GenAILabel")).toBe(true);
  });

  it("returns true for magic-* component names", () => {
    expect(_internal.isMarkerName("magic-button")).toBe(true);
    expect(_internal.isMarkerName("magic-text")).toBe(true);
  });

  it("returns false for unrelated names", () => {
    expect(_internal.isMarkerName("Button")).toBe(false);
    expect(_internal.isMarkerName("Card")).toBe(false);
    expect(_internal.isMarkerName("AvatarGroup")).toBe(false);
  });
});

describe("_internal.extractExportedNames", () => {
  it("extracts named re-exports", () => {
    const { names, hasStar } = _internal.extractExportedNames(
      "export { AILabel } from './ai-label';\nexport { Button } from './button';\n",
    );
    expect(names.has("AILabel")).toBe(true);
    expect(names.has("Button")).toBe(true);
    expect(hasStar).toBe(false);
  });

  it("detects star re-exports", () => {
    const { hasStar } = _internal.extractExportedNames("export * from './components';\n");
    expect(hasStar).toBe(true);
  });

  it("extracts function declarations", () => {
    const { names } = _internal.extractExportedNames("export function AIBadge() {}\n");
    expect(names.has("AIBadge")).toBe(true);
  });
});

describe("_internal.hasReservedAiTokens", () => {
  it("matches ai token patterns", () => {
    expect(_internal.hasReservedAiTokens("--color-ai-primary: #000;")).toBe(true);
    expect(_internal.hasReservedAiTokens("--p-color-magic-primary: #000;")).toBe(true);
    expect(_internal.hasReservedAiTokens("dragon-fruit")).toBe(true);
  });

  it("does not match unrelated content", () => {
    expect(_internal.hasReservedAiTokens("--color-primary: #000;")).toBe(false);
    expect(_internal.hasReservedAiTokens("export function Button() {}")).toBe(false);
  });
});
