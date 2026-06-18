import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { findProjectRoot } from "../_find-root.js";
import { parseTs } from "../../parsers/ts.js";
import { parseCss } from "../../parsers/css.js";
import { extractCssInJs } from "../../parsers/css-in-js.js";
import { getProjectContext } from "../context-cache.js";
import { posixRelative } from "../../util/paths.js";
import { disabledRuleIds } from "../../config/rules-config.js";
import { ruleObjects } from "../../rules/registry.js";
import { runRules } from "../../rule-runner.js";
import type { ParsedFiles, RuleContext } from "../../types.js";

export const auditFileTool: Tool = {
  name: "audit_file",
  description:
    "Audit a single file against the Lyse design system rules. Supports auditing UNSAVED buffers — pass the file's `content` and the agent's in-progress code is checked before it touches disk.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the file to audit (relative to project root or absolute).",
      },
      content: {
        type: "string",
        description:
          "Optional in-memory file content. If provided, the file at `path` is NOT read from disk — the audit runs against this string. Use this to check an unsaved buffer.",
      },
      project_root: {
        type: "string",
        description:
          "Optional project root for resolving config and tokens. Defaults to the directory containing `path` (walked up to find .lyse.yaml or .git).",
      },
    },
    required: ["path"],
  },
  outputSchema: {
    type: "object",
    properties: {
      schema_version: { type: "string", const: "1.0.0" },
      violations: {
        type: "array",
        description: "One entry per rule violation found in the file.",
        items: {
          type: "object",
          properties: {
            rule_id: { type: "string" },
            severity: { type: "string", enum: ["error", "warning", "info"] },
            range: {
              type: "object",
              properties: {
                line: { type: "integer" },
                column: { type: "integer" },
              },
              required: ["line", "column"],
            },
            message: { type: "string" },
            suggestion_available: { type: "boolean" },
            suggestion: { type: "string" },
            reason: {
              type: "string",
              enum: [
                "no_token_registry",
                "rule_not_auto_fixable",
                "unsupported_stack",
                "internal_error",
              ],
            },
          },
          required: ["rule_id", "severity", "range", "message", "suggestion_available"],
        },
      },
    },
    required: ["schema_version", "violations"],
  },
};

interface AuditFileInput {
  path?: unknown;
  content?: unknown;
  project_root?: unknown;
}

type SuggestionUnavailableReason =
  | "no_token_registry"
  | "rule_not_auto_fixable"
  | "unsupported_stack"
  | "internal_error";

interface AuditFileResult {
  schema_version: "1.0.0";
  violations: Array<{
    rule_id: string;
    severity: "error" | "warning" | "info";
    range: { line: number; column: number };
    message: string;
    suggestion_available: boolean;
    suggestion?: string;
    reason?: SuggestionUnavailableReason;
  }>;
}

const AUTO_FIXABLE_RULES = new Set([
  "tokens/no-hardcoded-color",
  "tokens/no-hardcoded-spacing",
  "components/no-native-shadows",
]);

export async function runAuditFile(input: AuditFileInput): Promise<AuditFileResult> {
  if (typeof input.path !== "string") {
    return {
      schema_version: "1.0.0",
      violations: [
        {
          rule_id: "internal",
          severity: "error",
          range: { line: 0, column: 0 },
          message: "`path` argument is required and must be a string",
          suggestion_available: false,
          reason: "internal_error",
        },
      ],
    };
  }
  const filePath = input.path;
  const content = typeof input.content === "string" ? input.content : null;
  const projectRoot =
    typeof input.project_root === "string" ? resolve(input.project_root) : findProjectRoot(filePath);

  const source = content ?? (existsSync(filePath) ? readFileSync(filePath, "utf8") : null);
  if (source === null) {
    return {
      schema_version: "1.0.0",
      violations: [
        {
          rule_id: "internal",
          severity: "error",
          range: { line: 0, column: 0 },
          message: `Could not read file: ${filePath}`,
          suggestion_available: false,
          reason: "internal_error",
        },
      ],
    };
  }

  // Build a minimal ParsedFiles for ONE file
  const rel = posixRelative(projectRoot, filePath);
  const parsed: ParsedFiles = { ts: [], css: [], cssInJs: [] };
  if (/\.(tsx?|jsx?|mjs|cjs)$/.test(filePath)) {
    parsed.ts.push(await parseTs(rel, source));
    parsed.cssInJs.push(...extractCssInJs(rel, source));
  } else if (/\.(s?css)$/.test(filePath)) {
    parsed.css.push(await parseCss(rel, source));
  } else {
    return {
      schema_version: "1.0.0",
      violations: [
        {
          rule_id: "internal",
          severity: "info",
          range: { line: 0, column: 0 },
          message: `Unsupported file type: ${filePath} (Lyse audits .ts/.tsx/.js/.jsx/.mjs/.cjs/.css/.scss)`,
          suggestion_available: false,
          reason: "unsupported_stack",
        },
      ],
    };
  }

  // Load project context (tokens, stories, config) — cached per project root so
  // a burst of single-file audits on a large repo doesn't re-scan the tree each
  // call (MCP P95 budget). See mcp/context-cache.ts.
  const { tokens, storyIndex, config } = await getProjectContext(projectRoot);
  const ctx: RuleContext = {
    repoRoot: projectRoot,
    tokens,
    componentsModule: config.designSystem?.componentsModule ?? null,
    componentInventory: [],
    storyIndex,
    excludePaths: [],
  };
  const disabled = disabledRuleIds(config);
  const rules = ruleObjects.filter(
    (r) => r.singleFileCapable === true && !disabled.has(r.id),
  );
  const runResult = await runRules(rules, ctx, parsed);

  // `loadTokens()` returns `TokenMap | null`. A null return ===
  // "no registry at all" (no .lyse.yaml, no Tailwind config, no DTCG
  // file, no CSS vars). A populated TokenMap with an empty axis-specific
  // map is a different signal — the rule had a registry to consult, it
  // just found no matching target token. We do NOT label that case as
  // `no_token_registry` (issue #88's enum doesn't have a separate value
  // for it; defer to a follow-up if needed).
  const tokenRegistryAbsent = tokens === null;

  return {
    schema_version: "1.0.0",
    violations: runResult.findings.map((f) => {
      const hasSuggestion = !!f.suggestion;
      const base = {
        rule_id: f.ruleId,
        severity: f.severity,
        range: { line: f.location.line, column: f.location.column },
        message: f.message,
        suggestion_available: hasSuggestion,
        ...(f.suggestion ? { suggestion: f.suggestion } : {}),
      };
      if (hasSuggestion) return base;
      if (!AUTO_FIXABLE_RULES.has(f.ruleId)) {
        return { ...base, reason: "rule_not_auto_fixable" as const };
      }
      if (tokenRegistryAbsent) {
        return { ...base, reason: "no_token_registry" as const };
      }
      return base;
    }),
  };
}
