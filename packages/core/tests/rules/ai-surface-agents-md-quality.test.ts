import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/ai-surface-agents-md-quality.js";
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
  tmp = mkdtempSync(join(tmpdir(), "lyse-agents-md-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("rule ai-surface/agents-md-quality", () => {
  it("emits a single info finding when no AGENTS.md exists anywhere", async () => {
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe("info");
    expect(result.findings[0]?.axis).toBe("ai-surface");
    expect(result.findings[0]?.ruleId).toBe("ai-surface/agents-md-quality");
    expect(result.findings[0]?.message).toContain("No AGENTS.md");
    expect(result.opportunities).toBe(1);
  });

  it("emits 0 findings when AGENTS.md passes all three quality checks", async () => {
    writeFileSync(join(tmp, "package.json"), "{}");
    writeFileSync(
      join(tmp, "AGENTS.md"),
      [
        "# Agent Onboarding",
        "",
        "## Build",
        "",
        "```bash",
        "pnpm install",
        "pnpm build",
        "```",
        "",
        "Expect exit code 0. The project uses package.json for dependency management.",
        "",
      ].join("\n"),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(3);
  });

  it("emits a warning when AGENTS.md has no runnable code block", async () => {
    writeFileSync(join(tmp, "package.json"), "{}");
    writeFileSync(
      join(tmp, "AGENTS.md"),
      [
        "# Agents",
        "",
        "Read this carefully. We use package.json. The expected exit code is 0.",
        "",
        "```",
        "no command here",
        "```",
      ].join("\n"),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const messages = result.findings.map((f) => f.message);
    expect(messages.some((m) => m.includes("no fenced code block starting with a runnable shell command"))).toBe(true);
  });

  it("emits a warning when AGENTS.md does not reference exit codes", async () => {
    writeFileSync(join(tmp, "package.json"), "{}");
    writeFileSync(
      join(tmp, "AGENTS.md"),
      [
        "# Agents",
        "",
        "We use package.json.",
        "",
        "```bash",
        "pnpm install",
        "```",
      ].join("\n"),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const messages = result.findings.map((f) => f.message);
    expect(messages.some((m) => m.includes("does not reference exit codes"))).toBe(true);
  });

  it("emits a warning when AGENTS.md doesn't mention any present toolchain config", async () => {
    writeFileSync(join(tmp, "package.json"), "{}");
    writeFileSync(
      join(tmp, "AGENTS.md"),
      [
        "# Agents",
        "",
        "```bash",
        "pnpm install",
        "```",
        "",
        "Expect exit code 0.",
      ].join("\n"),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const messages = result.findings.map((f) => f.message);
    expect(messages.some((m) => m.includes("does not mention any toolchain config"))).toBe(true);
  });

  it("respects fallback paths (.github/AGENTS.md, docs/AGENTS.md)", async () => {
    mkdirSync(join(tmp, "docs"));
    writeFileSync(join(tmp, "package.json"), "{}");
    writeFileSync(
      join(tmp, "docs/AGENTS.md"),
      [
        "# Docs Agents",
        "",
        "```bash",
        "pnpm test",
        "```",
        "",
        "Expect exit code 0 (uses package.json).",
      ].join("\n"),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(3);
  });

  it("does not emit when repoRoot is missing", async () => {
    const ctx: RuleContext = { ...makeCtx(tmp), repoRoot: "" };
    const result = await rule.evaluate(ctx, emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });
});

describe("_internal helpers", () => {
  it("startsWithRunnable detects pnpm, python, ./script paths, etc.", () => {
    expect(_internal.startsWithRunnable("pnpm install")).toBe(true);
    expect(_internal.startsWithRunnable("$ pnpm install")).toBe(true);
    expect(_internal.startsWithRunnable("python3 -m foo")).toBe(true);
    expect(_internal.startsWithRunnable("./scripts/run.sh")).toBe(true);
    expect(_internal.startsWithRunnable("hello world")).toBe(false);
    expect(_internal.startsWithRunnable("")).toBe(false);
  });

  it("extractFencedBlocks returns first non-empty content line per fence", () => {
    const md = [
      "intro",
      "```bash",
      "pnpm test",
      "```",
      "more",
      "```",
      "no-runnable",
      "```",
    ].join("\n");
    const blocks = _internal.extractFencedBlocks(md);
    expect(blocks.map((b) => b.firstLine)).toEqual(["pnpm test", "no-runnable"]);
  });

  it("EXIT_CODE_PATTERN matches common phrasings", () => {
    expect(_internal.EXIT_CODE_PATTERN.test("exit code 0")).toBe(true);
    expect(_internal.EXIT_CODE_PATTERN.test("exits with 2")).toBe(true);
    expect(_internal.EXIT_CODE_PATTERN.test("return code is 1")).toBe(true);
    expect(_internal.EXIT_CODE_PATTERN.test("nothing")).toBe(false);
  });
});
