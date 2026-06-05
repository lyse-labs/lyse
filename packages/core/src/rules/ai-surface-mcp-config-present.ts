import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type {
  Rule,
  RuleContext,
  ParsedFiles,
  RuleEvalResult,
  Finding,
} from "../types.js";
import { createLyseRule } from "./_rule-module.js";

const RULE_ID = "ai-surface/mcp-config-present";
const MAX_FILE_BYTES = 1_000_000;

const CANDIDATE_PATHS = [
  ".mcp.json",
  ".cursor/mcp.json",
  "claude_desktop_config.json",
];

const README_CANDIDATES = ["README.md", "README.mdx", "Readme.md", "readme.md"];

const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;

interface McpConfigShape {
  mcpServers?: unknown;
  [key: string]: unknown;
}

interface ServerValidation {
  ok: boolean;
  reason?: string;
}

function readJsonIfSmall(absPath: string): { data: unknown | null; parseError: string | null } {
  try {
    const stat = statSync(absPath);
    if (!stat.isFile()) return { data: null, parseError: "not a regular file" };
    if (stat.size > MAX_FILE_BYTES) return { data: null, parseError: "file too large" };
    const raw = readFileSync(absPath, "utf8");
    if (raw.trim().length === 0) return { data: null, parseError: "empty file" };
    return { data: JSON.parse(raw), parseError: null };
  } catch (e) {
    return { data: null, parseError: e instanceof Error ? e.message : "unknown parse error" };
  }
}

function isAllowlisted(repoRoot: string): boolean {
  for (const candidate of README_CANDIDATES) {
    const abs = join(repoRoot, candidate);
    if (!existsSync(abs)) continue;
    try {
      const stat = statSync(abs);
      if (!stat.isFile() || stat.size > MAX_FILE_BYTES) continue;
      const raw = readFileSync(abs, "utf8");
      if (raw.includes(DISABLE_DIRECTIVE)) return true;
    } catch {
      // ignore unreadable README
    }
  }
  return false;
}

function discoverConfigs(repoRoot: string): string[] {
  const found: string[] = [];
  for (const candidate of CANDIDATE_PATHS) {
    const abs = join(repoRoot, candidate);
    if (existsSync(abs)) found.push(candidate);
  }
  return found;
}

function validateServerEntry(name: unknown, entry: unknown): ServerValidation {
  if (typeof name !== "string" || name.trim().length === 0) {
    return { ok: false, reason: "server name is not a non-empty string" };
  }
  if (typeof entry !== "object" || entry === null) {
    return { ok: false, reason: `server "${name}" is not an object` };
  }
  const e = entry as { command?: unknown; args?: unknown };
  if (typeof e.command !== "string" || e.command.trim().length === 0) {
    return { ok: false, reason: `server "${name}" missing \`command\` (string)` };
  }
  if (e.args !== undefined && !Array.isArray(e.args)) {
    return { ok: false, reason: `server "${name}" has \`args\` that is not an array` };
  }
  return { ok: true };
}

interface ConfigValidation {
  errors: string[];
  validServers: number;
}

function validateConfig(data: unknown): ConfigValidation {
  if (typeof data !== "object" || data === null) {
    return { errors: ["config root is not a JSON object"], validServers: 0 };
  }
  const shape = data as McpConfigShape;
  if (!("mcpServers" in shape)) {
    return { errors: ["missing top-level `mcpServers` object"], validServers: 0 };
  }
  const servers = shape.mcpServers;
  if (typeof servers !== "object" || servers === null || Array.isArray(servers)) {
    return { errors: ["`mcpServers` must be an object"], validServers: 0 };
  }
  const entries = Object.entries(servers as Record<string, unknown>);
  if (entries.length === 0) {
    return { errors: ["`mcpServers` object is empty (declare at least one server)"], validServers: 0 };
  }
  const errors: string[] = [];
  let validServers = 0;
  for (const [name, entry] of entries) {
    const result = validateServerEntry(name, entry);
    if (!result.ok) {
      errors.push(result.reason ?? `server "${name}" is invalid`);
    } else {
      validServers += 1;
    }
  }
  return { errors, validServers };
}

const evaluate = async (
  ctx: RuleContext,
  _files: ParsedFiles,
): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (!ctx.repoRoot) {
    return { findings, opportunities: 0 };
  }

  if (isAllowlisted(ctx.repoRoot)) {
    return { findings, opportunities: 0 };
  }

  const configs = discoverConfigs(ctx.repoRoot);

  if (configs.length === 0) {
    findings.push({
      ruleId: RULE_ID,
      axis: "ai-surface",
      severity: "warning",
      location: { file: ".mcp.json", line: 1, column: 1 },
      message:
        "No MCP config file found — design system is not declared as AI-agent-accessible",
      suggestion:
        "create `.mcp.json` (Claude Code), `.cursor/mcp.json` (Cursor), or `claude_desktop_config.json` declaring at least one MCP server with a `command`",
    });
    return { findings, opportunities: 1 };
  }

  let opportunities = 0;
  for (const rel of configs) {
    opportunities += 1;
    const abs = join(ctx.repoRoot, rel);
    const { data, parseError } = readJsonIfSmall(abs);
    if (parseError !== null) {
      findings.push({
        ruleId: RULE_ID,
        axis: "ai-surface",
        severity: "error",
        location: { file: rel, line: 1, column: 1 },
        message: `MCP config is not valid JSON (${parseError})`,
        suggestion: "ensure the config is parseable JSON with a top-level `mcpServers` object",
      });
      continue;
    }
    const outcome = validateConfig(data);
    for (const err of outcome.errors) {
      findings.push({
        ruleId: RULE_ID,
        axis: "ai-surface",
        severity: "error",
        location: { file: rel, line: 1, column: 1 },
        message: err,
        suggestion:
          "each server entry must have a non-empty string key and a `command` (string); `args` (array) is optional",
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
    shortDescription: "Design system should declare at least one MCP server",
    fullDescription:
      "Looks for an MCP (Model Context Protocol) configuration file at the repo root: `.mcp.json` (Claude Code convention), `.cursor/mcp.json` (Cursor convention), or `claude_desktop_config.json`. When found, validates the file is parseable JSON, has a top-level `mcpServers` object with at least one entry, and each server entry has a non-empty string key and a `command` (string); `args` (array) is optional. Absence emits one warning (DS not yet AI-agent-accessible). Malformed JSON, missing/empty `mcpServers`, or invalid server entries emit errors.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/ai-surface-mcp-config-present.md",
    rationale: `Why it matters

The Model Context Protocol (MCP) is the de-facto standard for letting coding agents (Claude Code, Cursor, Claude Desktop) call tools that surface a design system's components, tokens, and docs at lookup time. A design system without an MCP server declaration leaves agents to scrape README and source files heuristically — the cost-vs-accuracy regression documented in Stream 1 of the AI-Consumable track.

The signal is binary and cheap to enforce: either the repo declares at least one valid \`mcpServers\` entry or it doesn't. A warning (not info) reflects the strategic importance of AI-Consumable readiness for Track 2 design systems: shipping a stable MCP surface is now table-stakes.

Severity escalates to error when a config file is present but malformed — a broken \`.mcp.json\` silently breaks every agent that tries to connect, which is worse than no config at all.`,
    examples: [
      {
        good: '{ "mcpServers": { "lyse": { "command": "npx", "args": ["@lyse-labs/lyse", "mcp"] } } }',
        bad: '{ "mcpServers": {} }',
      },
      {
        good: '{ "mcpServers": { "design-system": { "command": "node", "args": ["./mcp-server.js"] } } }',
        bad: '{ "servers": [] }',
      },
    ],
    allowlist: [
      "files larger than 1 MB — skipped to avoid pathological cases",
      "repos containing `// lyse-disable ai-surface/mcp-config-present` in an adjacent README — rule is N/A",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  validateConfig,
  validateServerEntry,
  isAllowlisted,
  discoverConfigs,
  CANDIDATE_PATHS,
  DISABLE_DIRECTIVE,
};
