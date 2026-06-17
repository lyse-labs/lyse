import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  rule,
  detectDocumentedPatterns,
} from "../../src/rules/ai-governance-interaction-pattern-docs.js";
import type { RuleContext, ParsedFiles } from "../../src/types.js";

const emptyParsed: ParsedFiles = { ts: [], css: [], cssInJs: [] };
function makeCtx(repoRoot: string): RuleContext {
  return { repoRoot, tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] };
}

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "lyse-pattern-docs-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe("detectDocumentedPatterns", () => {
  it("detects interaction patterns from headings in an AI-context doc", () => {
    const md = `# AI Assistant Patterns

## Suggestions
...
## Content Generation
...
## Regeneration
...
## Human Handoff
...`;
    const found = detectDocumentedPatterns([{ path: "docs/ai-patterns.md", content: md }]);
    expect(found.has("suggestion")).toBe(true);
    expect(found.has("generation")).toBe(true);
    expect(found.has("regeneration")).toBe(true);
    expect(found.has("handoff")).toBe(true);
  });

  it("ignores pattern words in a NON-AI doc (no AI context)", () => {
    const md = `# Changelog\n\n## History\n\n## Generation of releases`;
    const found = detectDocumentedPatterns([{ path: "CHANGELOG.md", content: md }]);
    expect(found.size).toBe(0);
  });

  it("ignores pattern words in body text (headings only)", () => {
    const md = `# AI Copilot\n\nWe support suggestion and regeneration in the body but no headings.`;
    const found = detectDocumentedPatterns([{ path: "docs/ai.md", content: md }]);
    expect(found.size).toBe(0);
  });
});

describe("rule ai-governance/interaction-pattern-docs", () => {
  it("emits info when an AI surface exists and interaction-pattern docs are present", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    mkdirSync(join(tmp, "docs"), { recursive: true });
    writeFileSync(join(tmp, "src", "AILabel.tsx"), "export const AILabel = () => null;");
    writeFileSync(
      join(tmp, "docs", "ai-patterns.md"),
      "# AI Assistant\n\n## Suggestions\n\n## Regeneration\n\n## Human Handoff\n",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    const f = result.findings[0]!;
    expect(f.severity).toBe("info");
    expect(f.axis).toBe("ai-governance");
    expect(f.ruleId).toBe("ai-governance/interaction-pattern-docs");
  });

  it("emits warning when an AI surface exists but no interaction-pattern docs are present", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(join(tmp, "src", "AILabel.tsx"), "export const AILabel = () => null;");
    writeFileSync(join(tmp, "README.md"), "# My DS\n\n## Installation\n");
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("warning");
  });

  it("emits no finding when there is no AI surface", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    mkdirSync(join(tmp, "docs"), { recursive: true });
    writeFileSync(join(tmp, "src", "Button.tsx"), "export const Button = () => null;");
    // Even with pattern docs present, no AI surface → no finding.
    writeFileSync(join(tmp, "docs", "ai.md"), "# AI\n## Suggestions\n");
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
    writeFileSync(join(tmp, "src", "AILabel.tsx"), "export const AILabel = () => null;");
    writeFileSync(join(tmp, "README.md"), "<!-- lyse-disable ai-governance/interaction-pattern-docs -->\n");
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
  });
});
