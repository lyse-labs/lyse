import { existsSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type {
  Rule,
  RuleContext,
  ParsedFiles,
  RuleEvalResult,
  Finding,
} from "../types.js";
import { createLyseRule } from "./_rule-module.js";

const RULE_ID = "ai-surface/agents-md-quality";
const MAX_FILE_BYTES = 500_000;

const CANDIDATE_PATHS = [
  "AGENTS.md",
  ".github/AGENTS.md",
  "docs/AGENTS.md",
];

const RUNNABLE_PREFIXES = [
  "pnpm",
  "npm",
  "yarn",
  "bun",
  "python",
  "python3",
  "cargo",
  "make",
  "bash",
  "sh",
  "node",
  "tsx",
  "deno",
  "npx",
  "go",
  "rake",
  "uv",
  "poetry",
  "ruff",
  "ruby",
];

const TOOLCHAIN_CONFIG_FILES = [
  "package.json",
  "tsconfig.json",
  "pyproject.toml",
  "Cargo.toml",
  "Makefile",
  ".lyse.yaml",
  ".lyse.yml",
  "lyse.config.ts",
  "lyse.config.js",
  "go.mod",
  "Gemfile",
  "pom.xml",
  "build.gradle",
  "deno.json",
  "deno.jsonc",
  "biome.json",
  "eslint.config.js",
  "vitest.config.ts",
];

const EXIT_CODE_PATTERN =
  /exit\s+code|exit code\s+\d+|exits?\s+(with\s+)?\d+|status\s+code|return code/i;

function readMarkdownIfSmall(absPath: string): string | null {
  try {
    const stat = statSync(absPath);
    if (!stat.isFile()) return null;
    if (stat.size > MAX_FILE_BYTES) return null;
    return readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
}

interface FencedBlock {
  firstLine: string;
  startLine: number;
}

function extractFencedBlocks(content: string): FencedBlock[] {
  const blocks: FencedBlock[] = [];
  const lines = content.split("\n");
  let inFence = false;
  let fenceMarker = "";
  let firstLine = "";
  let startLine = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trimStart();
    if (!inFence) {
      const m = trimmed.match(/^(`{3,}|~{3,})/);
      if (m) {
        inFence = true;
        fenceMarker = m[1] ?? "";
        firstLine = "";
        startLine = i + 1;
      }
    } else {
      if (trimmed.startsWith(fenceMarker)) {
        if (firstLine !== "") blocks.push({ firstLine, startLine });
        inFence = false;
        fenceMarker = "";
        firstLine = "";
        continue;
      }
      if (firstLine === "" && line.trim().length > 0) {
        firstLine = line.trim();
      }
    }
  }
  return blocks;
}

function startsWithRunnable(commandLine: string): boolean {
  const cleaned = commandLine.replace(/^[$#>]\s*/, "").trim();
  if (cleaned.length === 0) return false;
  const firstToken = cleaned.split(/\s+/, 1)[0] ?? "";
  if (RUNNABLE_PREFIXES.includes(firstToken)) return true;
  // Allow path-prefixed binaries like ./scripts/run.sh
  if (/^\.\/[\w./-]+$/.test(firstToken)) return true;
  return false;
}

interface QualityChecks {
  hasRunnableCodeBlock: boolean;
  referencesExitCodes: boolean;
  referencesToolchainConfig: boolean;
}

function evaluateQuality(content: string, presentConfigs: Set<string>): QualityChecks {
  const blocks = extractFencedBlocks(content);
  const hasRunnableCodeBlock = blocks.some((b) => startsWithRunnable(b.firstLine));
  const referencesExitCodes = EXIT_CODE_PATTERN.test(content);
  let referencesToolchainConfig = false;
  for (const cfg of presentConfigs) {
    if (content.includes(cfg)) {
      referencesToolchainConfig = true;
      break;
    }
  }
  return { hasRunnableCodeBlock, referencesExitCodes, referencesToolchainConfig };
}

function discoverPresentConfigs(repoRoot: string): Set<string> {
  const found = new Set<string>();
  for (const cfg of TOOLCHAIN_CONFIG_FILES) {
    if (existsSync(join(repoRoot, cfg))) found.add(cfg);
  }
  return found;
}

const evaluate = async (
  ctx: RuleContext,
  _files: ParsedFiles,
): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (!ctx.repoRoot) {
    return { findings, opportunities: 0 };
  }

  const presentConfigs = discoverPresentConfigs(ctx.repoRoot);

  const foundFiles: { rel: string; content: string }[] = [];
  for (const candidate of CANDIDATE_PATHS) {
    const abs = join(ctx.repoRoot, candidate);
    const content = readMarkdownIfSmall(abs);
    if (content !== null) {
      foundFiles.push({ rel: relative(ctx.repoRoot, abs) || candidate, content });
    }
  }

  if (foundFiles.length === 0) {
    findings.push({
      ruleId: RULE_ID,
      axis: "ai-surface",
      severity: "info",
      location: { file: "AGENTS.md", line: 1, column: 1 },
      message:
        "No AGENTS.md found — coding agents have no command-first instructions",
      suggestion:
        "create AGENTS.md at repo root with command-first sections (runnable shell commands + expected exit codes)",
    });
    return { findings, opportunities: 1 };
  }

  let opportunities = 0;
  for (const { rel, content } of foundFiles) {
    opportunities += 3;
    const quality = evaluateQuality(content, presentConfigs);
    if (!quality.hasRunnableCodeBlock) {
      findings.push({
        ruleId: RULE_ID,
        axis: "ai-surface",
        severity: "warning",
        location: { file: rel, line: 1, column: 1 },
        message:
          "AGENTS.md has no fenced code block starting with a runnable shell command (pnpm/npm/python/...)",
        suggestion:
          "add a section with a fenced code block whose first line is a real command an agent can run",
      });
    }
    if (!quality.referencesExitCodes) {
      findings.push({
        ruleId: RULE_ID,
        axis: "ai-surface",
        severity: "warning",
        location: { file: rel, line: 1, column: 1 },
        message:
          "AGENTS.md does not reference exit codes — agents cannot verify command success programmatically",
        suggestion:
          "document expected exit codes (e.g., `exit code 0 = clean`) for the commands you list",
      });
    }
    if (!quality.referencesToolchainConfig) {
      findings.push({
        ruleId: RULE_ID,
        axis: "ai-surface",
        severity: "warning",
        location: { file: rel, line: 1, column: 1 },
        message:
          "AGENTS.md does not mention any toolchain config file present in the repo (package.json, tsconfig.json, ...)",
        suggestion:
          "reference the project's actual config files so agents know which toolchain is in scope",
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
    shortDescription: "AGENTS.md should be command-first and machine-actionable",
    fullDescription:
      "Reads `AGENTS.md` at the repo root (with `.github/AGENTS.md` and `docs/AGENTS.md` fallbacks) and verifies three quality signals: (1) at least one fenced code block whose first line is a runnable shell command (pnpm/npm/yarn/bun/python/cargo/make/bash/sh/node/tsx/deno/...), (2) at least one mention of exit codes / status codes / return codes, (3) at least one reference to a toolchain config file the repo actually has (package.json, tsconfig.json, pyproject.toml, Makefile, .lyse.yaml, etc.). Each failing signal emits one warning; absence of AGENTS.md emits one info finding.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/ai-surface-agents-md-quality.md",
    rationale: `Why it matters

Coding agents (Claude Code, Cursor, Copilot Workspace, etc.) consume AGENTS.md as their bootstrap context. Research from the kodustech/agent-readiness study (Stream 2) shows that command-first AGENTS.md sections — containing runnable commands and explicit exit-code semantics — shift agent task success by 35–55%.

Mere presence is not enough. A prose-only AGENTS.md that explains the project in English without listing a single \`pnpm test\` block leaves the agent guessing at the toolchain. Worse, per Gloaguen et al. (2026), long unstructured context files *reduce* task success and *increase* token cost by 20%.

The rule enforces the cheapest, highest-leverage discipline: at least one runnable command, at least one explicit exit-code expectation, and at least one reference to the toolchain config the agent will encounter.`,
    examples: [
      {
        good: "## Build\\n\\n\\`\\`\\`bash\\npnpm install && pnpm test\\n\\`\\`\\`\\n\\nExit code 0 means clean. Uses package.json.",
        bad: "# Welcome\\n\\nThis repo is a TypeScript project. Please read the README before contributing.",
      },
    ],
    allowlist: [
      "files larger than 500 KB — skipped to avoid pathological cases",
      "repos with no AGENTS.md anywhere — emit a single info finding, not a warning",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  extractFencedBlocks,
  startsWithRunnable,
  evaluateQuality,
  EXIT_CODE_PATTERN,
  RUNNABLE_PREFIXES,
};
