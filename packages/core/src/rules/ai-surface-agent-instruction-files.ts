import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import fg from "fast-glob";
import { parse as parseYaml } from "yaml";
import type {
  Rule,
  RuleContext,
  ParsedFiles,
  RuleEvalResult,
  Finding,
} from "../types.js";
import { isPathExcluded } from "./_exclude.js";
import { createLyseRule } from "./_rule-module.js";

const RULE_ID = "ai-surface/agent-instruction-files";
const MAX_FILE_BYTES = 500_000;
const TOKEN_BUDGET_BYTES = 5_000;
const DESCRIPTION_MAX_CHARS = 200;

const CURSOR_RULE_GLOBS = [".cursor/rules/**/*.mdc"];
const CLAUDE_SKILL_GLOBS = [".claude/skills/*/SKILL.md"];

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/;
const KEBAB_CASE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type FrontmatterParseResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

function readFileIfSmall(absPath: string): { content: string | null; bytes: number } {
  try {
    const stat = statSync(absPath);
    if (!stat.isFile()) return { content: null, bytes: 0 };
    const bytes = stat.size;
    if (bytes > MAX_FILE_BYTES) return { content: null, bytes };
    return { content: readFileSync(absPath, "utf8"), bytes };
  } catch {
    return { content: null, bytes: 0 };
  }
}

function parseFrontmatter(content: string): FrontmatterParseResult {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    return { ok: false, error: "no YAML frontmatter (expected `---` fenced block at top of file)" };
  }
  const yamlBody = match[1] ?? "";
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlBody);
  } catch (e) {
    return {
      ok: false,
      error: `frontmatter YAML parse error: ${e instanceof Error ? e.message : "unknown"}`,
    };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "frontmatter must be a YAML mapping" };
  }
  return { ok: true, data: parsed as Record<string, unknown> };
}

function isStringOrStringArray(value: unknown): value is string | string[] {
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) {
    return value.length > 0 && value.every((v) => typeof v === "string" && v.length > 0);
  }
  return false;
}

interface CursorValidation {
  errors: string[];
  warnings: string[];
}

function validateCursorRuleFrontmatter(fm: Record<string, unknown>): CursorValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  const description = fm.description;
  if (typeof description !== "string" || description.trim().length === 0) {
    errors.push("missing required `description` (string)");
  } else if (description.trim().length > DESCRIPTION_MAX_CHARS) {
    warnings.push(`\`description\` is ${description.trim().length} chars (> ${DESCRIPTION_MAX_CHARS}); consider shortening`);
  }

  if (!("globs" in fm)) {
    errors.push("missing required `globs` (string or array of strings)");
  } else if (!isStringOrStringArray(fm.globs)) {
    errors.push("`globs` must be a non-empty string or array of strings");
  }

  if ("alwaysApply" in fm && typeof fm.alwaysApply !== "boolean") {
    warnings.push("`alwaysApply` should be a boolean");
  }

  return { errors, warnings };
}

interface SkillValidation {
  errors: string[];
  warnings: string[];
}

function validateSkillFrontmatter(fm: Record<string, unknown>): SkillValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  const name = fm.name;
  if (typeof name !== "string" || name.trim().length === 0) {
    errors.push("missing required `name` (kebab-case string)");
  } else if (!KEBAB_CASE_RE.test(name)) {
    warnings.push(`\`name\` "${name}" should be kebab-case (lowercase, hyphen-separated)`);
  }

  const description = fm.description;
  if (typeof description !== "string" || description.trim().length === 0) {
    errors.push("missing required `description` (string)");
  } else if (description.trim().length > DESCRIPTION_MAX_CHARS) {
    warnings.push(`\`description\` is ${description.trim().length} chars (> ${DESCRIPTION_MAX_CHARS}); consider shortening`);
  }

  return { errors, warnings };
}

function discoverFiles(ctx: RuleContext, patterns: string[]): string[] {
  if (!ctx.repoRoot) return [];
  let entries: string[] = [];
  try {
    entries = fg.sync(patterns, {
      cwd: ctx.repoRoot,
      absolute: false,
      dot: true,
      onlyFiles: true,
      ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**"],
      followSymbolicLinks: false,
    });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const rel of entries) {
    if (isPathExcluded(rel, ctx.excludePaths)) continue;
    out.push(rel);
  }
  return out.sort();
}

const evaluate = async (
  ctx: RuleContext,
  _files: ParsedFiles,
): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (!ctx.repoRoot) {
    return { findings, opportunities: 0 };
  }

  const cursorFiles = discoverFiles(ctx, CURSOR_RULE_GLOBS);
  const skillFiles = discoverFiles(ctx, CLAUDE_SKILL_GLOBS);

  if (cursorFiles.length === 0 && skillFiles.length === 0) {
    findings.push({
      ruleId: RULE_ID,
      axis: "ai-surface",
      severity: "warning",
      location: { file: ".cursor/rules/", line: 1, column: 1 },
      message:
        "No agent instruction files found (neither `.cursor/rules/*.mdc` nor `.claude/skills/*/SKILL.md`)",
      suggestion:
        "add at least one Cursor rule under `.cursor/rules/` or one Claude skill under `.claude/skills/<name>/SKILL.md` so coding agents have project-specific guidance",
    });
    // WHY: opportunities: 1 (not 0) signals one actionable fix exists (add any instruction file).
    // This differs from sibling rules that return opportunities: N (one per candidate path) because
    // here the surface is entirely absent — there is no per-file opportunity to count.
    return { findings, opportunities: 1 };
  }

  let opportunities = 0;

  for (const rel of cursorFiles) {
    opportunities += 1;
    const abs = join(ctx.repoRoot, rel);
    const { content, bytes } = readFileIfSmall(abs);
    const relPath = rel;
    if (content === null) {
      findings.push({
        ruleId: RULE_ID,
        axis: "ai-surface",
        severity: "warning",
        location: { file: relPath, line: 1, column: 1 },
        message: `Cursor rule file ${relPath} could not be read (file too large: ${bytes} bytes)`,
        suggestion: `split the rule into smaller files (≤ ${MAX_FILE_BYTES} bytes)`,
      });
      continue;
    }
    if (bytes > TOKEN_BUDGET_BYTES) {
      findings.push({
        ruleId: RULE_ID,
        axis: "ai-surface",
        severity: "warning",
        location: { file: relPath, line: 1, column: 1 },
        message: `Cursor rule file is ${bytes} bytes (> ${TOKEN_BUDGET_BYTES} byte token-budget) — costs agents context`,
        suggestion: "split into smaller focused rules or trim prose; agents pay context cost on every load",
      });
    }
    const parsed = parseFrontmatter(content);
    if (!parsed.ok) {
      findings.push({
        ruleId: RULE_ID,
        axis: "ai-surface",
        severity: "error",
        location: { file: relPath, line: 1, column: 1 },
        message: `Cursor rule ${relPath} has invalid frontmatter: ${parsed.error}`,
        suggestion: "wrap frontmatter in `---` markers and ensure `description` + `globs` keys are present",
      });
      continue;
    }
    const { errors, warnings } = validateCursorRuleFrontmatter(parsed.data);
    for (const err of errors) {
      findings.push({
        ruleId: RULE_ID,
        axis: "ai-surface",
        severity: "error",
        location: { file: relPath, line: 1, column: 1 },
        message: `Cursor rule ${relPath}: ${err}`,
        suggestion: "see https://cursor.com/docs/context/rules for the expected frontmatter shape",
      });
    }
    for (const warn of warnings) {
      findings.push({
        ruleId: RULE_ID,
        axis: "ai-surface",
        severity: "warning",
        location: { file: relPath, line: 1, column: 1 },
        message: `Cursor rule ${relPath}: ${warn}`,
      });
    }
  }

  for (const rel of skillFiles) {
    opportunities += 1;
    const abs = join(ctx.repoRoot, rel);
    const { content, bytes } = readFileIfSmall(abs);
    const relPath = rel;
    if (content === null) {
      findings.push({
        ruleId: RULE_ID,
        axis: "ai-surface",
        severity: "warning",
        location: { file: relPath, line: 1, column: 1 },
        message: `Claude skill file ${relPath} could not be read (file too large: ${bytes} bytes)`,
        suggestion: `keep SKILL.md focused (≤ ${MAX_FILE_BYTES} bytes); use linked files for verbose references`,
      });
      continue;
    }
    if (bytes > TOKEN_BUDGET_BYTES) {
      findings.push({
        ruleId: RULE_ID,
        axis: "ai-surface",
        severity: "warning",
        location: { file: relPath, line: 1, column: 1 },
        message: `Claude skill file is ${bytes} bytes (> ${TOKEN_BUDGET_BYTES} byte token-budget) — costs agents context`,
        suggestion: "trim SKILL.md and offload verbose references to linked files",
      });
    }
    const parsed = parseFrontmatter(content);
    if (!parsed.ok) {
      findings.push({
        ruleId: RULE_ID,
        axis: "ai-surface",
        severity: "error",
        location: { file: relPath, line: 1, column: 1 },
        message: `Claude skill ${relPath} has invalid frontmatter: ${parsed.error}`,
        suggestion: "wrap frontmatter in `---` markers and ensure `name` + `description` keys are present",
      });
      continue;
    }
    const { errors, warnings } = validateSkillFrontmatter(parsed.data);
    for (const err of errors) {
      findings.push({
        ruleId: RULE_ID,
        axis: "ai-surface",
        severity: "error",
        location: { file: relPath, line: 1, column: 1 },
        message: `Claude skill ${relPath}: ${err}`,
        suggestion: "see https://docs.claude.com/en/docs/agents-and-tools/skills for the expected frontmatter shape",
      });
    }
    for (const warn of warnings) {
      findings.push({
        ruleId: RULE_ID,
        axis: "ai-surface",
        severity: "warning",
        location: { file: relPath, line: 1, column: 1 },
        message: `Claude skill ${relPath}: ${warn}`,
      });
    }
  }

  return { findings, opportunities };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "ai-surface",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Repo should ship Cursor rules or Claude skills with valid frontmatter",
    fullDescription:
      "Scans for agent instruction bundles at the repo root: `.cursor/rules/*.mdc` (Cursor rules) and `.claude/skills/*/SKILL.md` (Anthropic Claude skills). When neither is present, emits a single warning — the repo gives coding agents no project-specific guidance signal. When found, each file is parsed for YAML frontmatter and validated: Cursor rules must declare `description` and `globs`; Claude skills must declare `name` (kebab-case) and `description` (≤200 chars). Files larger than 5 KB raise a token-budget warning (they cost agents context on every load). Malformed frontmatter and missing required keys raise errors; oversize, non-kebab `name`, and overlong descriptions raise warnings.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/ai-surface-agent-instruction-files.md",
    rationale: `Why it matters

Cursor rules and Claude skills are the contract surface for two of the most-used coding agents in 2026. Without at least one of these bundles, the agent has no project-specific guidance beyond \`AGENTS.md\` or \`CLAUDE.md\` — and even those don't carry the same auto-attach semantics as Cursor's \`globs\` field or the same auto-load semantics as Claude's skill manifest.

Beyond presence, the *frontmatter* matters. Cursor uses \`globs\` to decide which rule fires for which file edit; missing \`globs\` silently disables the rule. Claude skills are loaded by their \`name\` + \`description\` pair (the description is the agent's "tool selection" prompt); a missing description means the skill is invisible to the agent's decision loop.

Token budget is the third signal. The Anthropic agent skills documentation (Oct 2026) and the Cursor rules documentation both recommend keeping individual files small — long instruction files crowd out the actual context the agent needs to read, and inflate per-call cost. The 5 KB heuristic is the same threshold the Claude skill examples use.`,
    examples: [
      {
        good: '---\\ndescription: TypeScript style guide for this monorepo\\nglobs: ["src/**/*.ts", "src/**/*.tsx"]\\nalwaysApply: false\\n---\\n\\n# TypeScript style\\n\\nUse strict mode. Prefer type aliases over interfaces.',
        bad: '---\\n# missing required `description` and `globs`\\n---\\n\\n# TypeScript style\\n\\nUse strict mode.',
      },
      {
        good: '---\\nname: pr-checklist\\ndescription: Generates a PR checklist from the diff (≤200 chars)\\nversion: 1.0.0\\n---\\n\\n# PR checklist skill\\n\\nProcedural instructions for the agent.',
        bad: '---\\nname: PR_Checklist\\n# missing `description`; `name` is not kebab-case\\n---\\n\\n# PR checklist',
      },
    ],
    allowlist: [
      "files larger than 500 KB — skipped to avoid pathological cases (and counted as an oversize warning)",
      "files matching `ctx.excludePaths` config",
      "repos that ship only AGENTS.md/CLAUDE.md but neither Cursor rules nor Claude skills — emit one warning (not error) to nudge adoption",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  parseFrontmatter,
  validateCursorRuleFrontmatter,
  validateSkillFrontmatter,
  isStringOrStringArray,
  CURSOR_RULE_GLOBS,
  CLAUDE_SKILL_GLOBS,
  TOKEN_BUDGET_BYTES,
  DESCRIPTION_MAX_CHARS,
  KEBAB_CASE_RE,
};
