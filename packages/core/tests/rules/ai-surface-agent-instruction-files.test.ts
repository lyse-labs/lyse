import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/ai-surface-agent-instruction-files.js";
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

function writeCursorRule(root: string, name: string, frontmatter: string, body = "# rule body\n\nText."): void {
  mkdirSync(join(root, ".cursor", "rules"), { recursive: true });
  writeFileSync(join(root, ".cursor", "rules", `${name}.mdc`), `---\n${frontmatter}\n---\n\n${body}\n`);
}

function writeClaudeSkill(root: string, name: string, frontmatter: string, body = "# Skill\n\nBody."): void {
  mkdirSync(join(root, ".claude", "skills", name), { recursive: true });
  writeFileSync(join(root, ".claude", "skills", name, "SKILL.md"), `---\n${frontmatter}\n---\n\n${body}\n`);
}

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "lyse-agent-instr-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("rule ai-surface/agent-instruction-files", () => {
  it("fixture 1 (none): emits a single warning when neither .cursor/rules nor .claude/skills exists", async () => {
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe("warning");
    expect(result.findings[0]?.axis).toBe("ai-surface");
    expect(result.findings[0]?.ruleId).toBe("ai-surface/agent-instruction-files");
    expect(result.findings[0]?.message).toContain("No agent instruction files found");
    expect(result.opportunities).toBe(1);
  });

  it("fixture 2 (cursor-only valid): emits 0 findings with a valid Cursor rule", async () => {
    writeCursorRule(
      tmp,
      "typescript",
      [
        "description: TypeScript style guide",
        'globs: ["src/**/*.ts", "src/**/*.tsx"]',
        "alwaysApply: false",
      ].join("\n"),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(1);
  });

  it("fixture 3 (claude-only valid): emits 0 findings with a valid Claude skill", async () => {
    writeClaudeSkill(
      tmp,
      "pr-checklist",
      [
        "name: pr-checklist",
        "description: Generates a PR checklist from the diff",
        "version: 1.0.0",
      ].join("\n"),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(1);
  });

  it("fixture 4 (both valid): emits 0 findings when both surfaces are present and valid", async () => {
    writeCursorRule(
      tmp,
      "ts",
      ["description: TS rules", 'globs: "src/**/*.ts"'].join("\n"),
    );
    writeClaudeSkill(
      tmp,
      "lint-fix",
      ["name: lint-fix", "description: Runs the linter and applies fixes"].join("\n"),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(2);
  });

  it("fixture 5 (malformed cursor): emits an error when Cursor rule is missing `description`", async () => {
    writeCursorRule(tmp, "bad", 'globs: ["src/**/*.ts"]');
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const errors = result.findings.filter((f) => f.severity === "error");
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors.some((f) => f.message.includes("missing required `description`"))).toBe(true);
  });

  it("emits an error when Cursor rule is missing `globs`", async () => {
    writeCursorRule(tmp, "bad-globs", "description: A rule without globs");
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const errors = result.findings.filter((f) => f.severity === "error");
    expect(errors.some((f) => f.message.includes("missing required `globs`"))).toBe(true);
  });

  it("emits an error when Claude skill is missing `name` or `description`", async () => {
    writeClaudeSkill(tmp, "broken", "version: 1.0.0");
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const errors = result.findings.filter((f) => f.severity === "error");
    expect(errors.some((f) => f.message.includes("missing required `name`"))).toBe(true);
    expect(errors.some((f) => f.message.includes("missing required `description`"))).toBe(true);
  });

  it("emits an error when the .mdc file has no frontmatter at all", async () => {
    mkdirSync(join(tmp, ".cursor", "rules"), { recursive: true });
    writeFileSync(join(tmp, ".cursor", "rules", "raw.mdc"), "# Just markdown, no frontmatter\n");
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const errors = result.findings.filter((f) => f.severity === "error");
    expect(errors.some((f) => f.message.includes("no YAML frontmatter"))).toBe(true);
  });

  it("emits a token-budget warning when a file exceeds 5 KB", async () => {
    const body = "x".repeat(6000);
    writeCursorRule(
      tmp,
      "huge",
      ['description: huge', 'globs: "src/**/*.ts"'].join("\n"),
      body,
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const warnings = result.findings.filter((f) => f.severity === "warning");
    expect(warnings.some((f) => f.message.includes("token-budget"))).toBe(true);
  });

  it("emits a warning when Claude skill `name` is not kebab-case", async () => {
    writeClaudeSkill(
      tmp,
      "BadName",
      ["name: BadName", "description: not kebab-case"].join("\n"),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const warnings = result.findings.filter((f) => f.severity === "warning");
    expect(warnings.some((f) => f.message.includes("kebab-case"))).toBe(true);
  });

  it("emits a warning when description exceeds 200 chars", async () => {
    const longDesc = "x".repeat(250);
    writeClaudeSkill(
      tmp,
      "verbose",
      [`name: verbose`, `description: ${longDesc}`].join("\n"),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const warnings = result.findings.filter((f) => f.severity === "warning");
    expect(warnings.some((f) => f.message.includes("chars"))).toBe(true);
  });

  it("emits a warning when Cursor rule has alwaysApply as a non-boolean (e.g. string)", async () => {
    writeCursorRule(
      tmp,
      "always-string",
      ['description: My rule', 'globs: "src/**/*.ts"', 'alwaysApply: "true"'].join("\n"),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const warnings = result.findings.filter((f) => f.severity === "warning");
    expect(warnings.some((f) => f.message.includes("alwaysApply"))).toBe(true);
  });

  it("emits an error when the .mdc file has invalid (unparseable) YAML frontmatter", async () => {
    mkdirSync(join(tmp, ".cursor", "rules"), { recursive: true });
    writeFileSync(
      join(tmp, ".cursor", "rules", "bad-yaml.mdc"),
      "---\n: bad\n  : worse\n---\n# title\n",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const errors = result.findings.filter((f) => f.severity === "error");
    expect(errors.some((f) => f.message.includes("invalid frontmatter"))).toBe(true);
  });

  it("respects excludePaths", async () => {
    writeCursorRule(tmp, "skip-me", "garbage");
    const ctx: RuleContext = { ...makeCtx(tmp), excludePaths: [".cursor/**"] };
    const result = await rule.evaluate(ctx, emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.message).toContain("No agent instruction files found");
  });

  it("does not emit when repoRoot is missing", async () => {
    const ctx: RuleContext = { ...makeCtx(tmp), repoRoot: "" };
    const result = await rule.evaluate(ctx, emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });
});

describe("_internal helpers", () => {
  it("parseFrontmatter returns ok on a valid mapping", () => {
    const res = _internal.parseFrontmatter("---\nname: x\ndescription: y\n---\n\nbody");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.name).toBe("x");
      expect(res.data.description).toBe("y");
    }
  });

  it("parseFrontmatter returns error when no fence", () => {
    const res = _internal.parseFrontmatter("# no frontmatter");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("no YAML frontmatter");
  });

  it("parseFrontmatter returns error when YAML is invalid", () => {
    const res = _internal.parseFrontmatter("---\n: bad\n  : worse\n---\n");
    expect(res.ok).toBe(false);
  });

  it("validateCursorRuleFrontmatter accepts string or array globs", () => {
    expect(_internal.validateCursorRuleFrontmatter({ description: "x", globs: "src/**/*.ts" }).errors).toHaveLength(0);
    expect(_internal.validateCursorRuleFrontmatter({ description: "x", globs: ["a", "b"] }).errors).toHaveLength(0);
  });

  it("validateCursorRuleFrontmatter rejects empty globs", () => {
    expect(_internal.validateCursorRuleFrontmatter({ description: "x", globs: [] }).errors.length).toBeGreaterThan(0);
    expect(_internal.validateCursorRuleFrontmatter({ description: "x", globs: "" }).errors.length).toBeGreaterThan(0);
  });

  it("validateSkillFrontmatter flags non-kebab name", () => {
    const res = _internal.validateSkillFrontmatter({ name: "BadName", description: "ok" });
    expect(res.warnings.some((w) => w.includes("kebab-case"))).toBe(true);
  });

  it("KEBAB_CASE_RE accepts kebab-case", () => {
    expect(_internal.KEBAB_CASE_RE.test("good-name")).toBe(true);
    expect(_internal.KEBAB_CASE_RE.test("g")).toBe(true);
    expect(_internal.KEBAB_CASE_RE.test("BadName")).toBe(false);
    expect(_internal.KEBAB_CASE_RE.test("two--dashes")).toBe(false);
  });
});
