import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  rule,
  findReservedAiTokenUsages,
} from "../../src/rules/ai-governance-ai-token-misuse.js";
import type { RuleContext, ParsedFiles } from "../../src/types.js";

const emptyParsed: ParsedFiles = { ts: [], css: [], cssInJs: [] };
function makeCtx(repoRoot: string): RuleContext {
  return { repoRoot, tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] };
}

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "lyse-ai-misuse-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe("findReservedAiTokenUsages", () => {
  it("detects var(--ai-*) usages of reserved AI tokens", () => {
    expect(findReservedAiTokenUsages("a { background: var(--cds-ai-aura-start); }")).toEqual(["--cds-ai-aura-start"]);
    expect(findReservedAiTokenUsages("a { color: var(--ai-gradient-1); }")).toEqual(["--ai-gradient-1"]);
  });
  it("detects SCSS $ai-* and namespaced theme.$ai-* usages", () => {
    expect(findReservedAiTokenUsages("a { background: theme.$ai-aura-start; }")).toEqual(["ai-aura-start"]);
    expect(findReservedAiTokenUsages("a { color: $ai-gradient-end; }")).toEqual(["ai-gradient-end"]);
  });
  it("does NOT flag token DEFINITIONS (the value is being assigned, not used)", () => {
    expect(findReservedAiTokenUsages("--ai-gradient-1: linear-gradient(red, blue);")).toEqual([]);
    expect(findReservedAiTokenUsages("$ai-aura-start: #fff;")).toEqual([]);
  });
  it("does NOT flag non-AI tokens", () => {
    expect(findReservedAiTokenUsages("a { margin: var(--spacing-2); color: $brand-primary; }")).toEqual([]);
  });
});

describe("rule ai-governance/ai-token-misuse", () => {
  it("warns when a reserved AI token is used in a generic (non-AI) file", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    // token definition file (AI-named) + a generic Button that misuses the AI token
    writeFileSync(join(tmp, "src", "ai-tokens.css"), ":root { --ai-gradient-1: linear-gradient(red, blue); }");
    writeFileSync(join(tmp, "src", "Button.css"), ".btn { background: var(--ai-gradient-1); }");
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    const f = result.findings[0]!;
    expect(f.severity).toBe("warning");
    expect(f.axis).toBe("ai-governance");
    expect(f.ruleId).toBe("ai-governance/ai-token-misuse");
    expect(f.message).toContain("--ai-gradient-1");
    expect(f.location.file).toContain("Button.css");
  });

  it("does NOT warn when the AI token is used in a file with an AI marker", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "AiPanel.tsx"),
      "export const AILabel = () => null;\nexport const Panel = () => <div style={{ background: 'var(--ai-gradient-1)' }} />;",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT warn when used in an AI-named file (Carbon _ai-*.scss pattern)", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(join(tmp, "src", "_ai-aura.scss"), ".aura { background: theme.$ai-aura-start; }");
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does NOT warn on token definitions alone (no usage outside AI context)", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(join(tmp, "src", "tokens.css"), ":root { --ai-gradient-1: linear-gradient(red, blue); }");
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
  });

  it("emits no finding when the repo has no reserved AI tokens at all", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(join(tmp, "src", "Button.css"), ".btn { margin: var(--spacing-2); }");
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });

  it("returns no findings when repoRoot is not set", async () => {
    const result = await rule.evaluate(makeCtx(""), emptyParsed);
    expect(result.findings).toHaveLength(0);
  });

  it("emits no finding when README.md contains the lyse-disable directive", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(join(tmp, "src", "Button.css"), ".btn { background: var(--ai-gradient-1); }");
    writeFileSync(join(tmp, "README.md"), "<!-- lyse-disable ai-governance/ai-token-misuse -->\n");
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
  });
});
