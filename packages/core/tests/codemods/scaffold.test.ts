import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeMissingScaffolds } from "../../src/codemods/scaffold.js";
import { rule as llmsTxtRule } from "../../src/rules/ai-surface-llms-txt-structure.js";
import { rule as agentsMdRule } from "../../src/rules/ai-surface-agents-md-quality.js";
import type { RuleContext, ParsedFiles } from "../../src/types.js";

const emptyParsed: ParsedFiles = { ts: [], css: [], cssInJs: [] };
function ctx(repoRoot: string): RuleContext {
  return { repoRoot, tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lyse-scaffold-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "@acme/ui", version: "1.0.0" }));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("computeMissingScaffolds", () => {
  it("proposes llms.txt and AGENTS.md when none exist", () => {
    const s = computeMissingScaffolds(dir);
    const paths = s.map((x) => x.path).sort();
    expect(paths).toContain("llms.txt");
    expect(paths).toContain("AGENTS.md");
  });

  it("omits a target that already exists (idempotent)", () => {
    writeFileSync(join(dir, "llms.txt"), "# Existing\n");
    const s = computeMissingScaffolds(dir);
    expect(s.some((x) => x.path === "llms.txt")).toBe(false);
    expect(s.some((x) => x.path === "AGENTS.md")).toBe(true);
  });

  it("detects AGENTS.md in alternate locations (.github / docs)", () => {
    mkdirSync(join(dir, "docs"), { recursive: true });
    writeFileSync(join(dir, "docs", "AGENTS.md"), "# x\n");
    const s = computeMissingScaffolds(dir);
    expect(s.some((x) => x.path === "AGENTS.md")).toBe(false);
  });

  it("returns nothing when all targets already exist", () => {
    writeFileSync(join(dir, "llms.txt"), "# x\n");
    writeFileSync(join(dir, "AGENTS.md"), "# x\n");
    expect(computeMissingScaffolds(dir)).toHaveLength(0);
  });
});

describe("scaffolded content satisfies the detection rules", () => {
  it("the generated llms.txt passes ai-surface/llms-txt-structure", async () => {
    const s = computeMissingScaffolds(dir).find((x) => x.path === "llms.txt")!;
    writeFileSync(join(dir, "llms.txt"), s.content);
    const r = await llmsTxtRule.evaluate(ctx(dir), emptyParsed);
    expect(r.findings).toHaveLength(0);
  });

  it("the generated AGENTS.md passes ai-surface/agents-md-quality", async () => {
    const s = computeMissingScaffolds(dir).find((x) => x.path === "AGENTS.md")!;
    writeFileSync(join(dir, "AGENTS.md"), s.content);
    const r = await agentsMdRule.evaluate(ctx(dir), emptyParsed);
    expect(r.findings).toHaveLength(0);
  });
});
