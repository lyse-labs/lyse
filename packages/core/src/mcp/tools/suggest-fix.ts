import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { findProjectRoot } from "../_find-root.js";
import type { Finding, RuleContext, RuleId, Severity } from "../../types.js";
import { loadTokens } from "../../loaders/tokens.js";
import { loadStories } from "../../loaders/stories.js";
import { loadConfig } from "../../config/schema.js";
import { applyCodemod, type CodemodResult } from "../../codemods/index.js";

export const suggestFixTool: Tool = {
  name: "suggest_fix",
  description:
    "For a given finding (rule_id + path + line), return a unified-diff patch that fixes it. " +
    "**Only call when the corresponding `audit_file` finding has `suggestion_available: true`** — " +
    "otherwise the patch will be `null` with a rationale. Auto-fixable rules: " +
    "tokens/no-hardcoded-color, tokens/no-hardcoded-spacing, components/no-native-shadows.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the file." },
      content: {
        type: "string",
        description:
          "Optional unsaved buffer content. If provided, the file is not read from disk.",
      },
      project_root: {
        type: "string",
        description: "Optional project root for resolving config and tokens.",
      },
      rule_id: { type: "string", description: "The rule id to fix." },
      line: { type: "integer", description: "Line number of the finding (1-based)." },
      column: { type: "integer", description: "Column of the finding (1-based)." },
    },
    required: ["path", "rule_id", "line"],
  },
  outputSchema: {
    type: "object",
    properties: {
      patch: { type: ["string", "null"], description: "Unified-diff patch, or null when no fix is available." },
      confidence: { type: "number", description: "0–1 (1 = deterministic single-candidate replacement)." },
      alternatives: {
        type: "array",
        items: {
          type: "object",
          properties: { patch: { type: "string" }, rationale: { type: "string" } },
          required: ["patch", "rationale"],
        },
      },
      rationale: { type: ["string", "null"], description: "When patch is null, why no fix is available." },
      rule_id: { type: "string" },
      schema_version: { type: "string", const: "1.0.0" },
    },
    required: ["patch", "confidence", "alternatives", "rationale", "rule_id", "schema_version"],
  },
};

interface SuggestFixInput {
  path?: unknown;
  content?: unknown;
  project_root?: unknown;
  rule_id?: unknown;
  line?: unknown;
  column?: unknown;
}

function synthesizeMessage(ruleId: string, source: string, line: number): string {
  // For shadow-native, the message format is parsed by the codemod to extract the tag name.
  // Synthesize a finding-like message so the codemod can extract the tag.
  if (ruleId === "components/no-native-shadows") {
    const lineText = source.split("\n")[line - 1] ?? "";
    const tagMatch = lineText.match(/<(button|a|input|select|textarea)\b/);
    if (tagMatch) {
      return `Native <${tagMatch[1]}> used where <DS-equivalent> from <module> is available`;
    }
    return "shadow-native";
  }
  return `${ruleId} at line ${line}`;
}

export async function runSuggestFix(input: SuggestFixInput): Promise<CodemodResult> {
  if (
    typeof input.path !== "string" ||
    typeof input.rule_id !== "string" ||
    typeof input.line !== "number"
  ) {
    return {
      patch: null,
      confidence: 0,
      alternatives: [],
      rationale: "Required args: path (string), rule_id (string), line (integer).",
      rule_id: typeof input.rule_id === "string" ? input.rule_id : "internal",
      schema_version: "1.0.0",
    };
  }

  const filePath = input.path;
  const content = typeof input.content === "string" ? input.content : null;
  const projectRoot =
    typeof input.project_root === "string"
      ? resolve(input.project_root)
      : findProjectRoot(filePath);

  const source = content ?? (existsSync(filePath) ? readFileSync(filePath, "utf8") : null);
  if (source === null) {
    return {
      patch: null,
      confidence: 0,
      alternatives: [],
      rationale: `Could not read file: ${filePath}`,
      rule_id: input.rule_id,
      schema_version: "1.0.0",
    };
  }

  const config = loadConfig(projectRoot, { onError: "degrade" });
  const componentsModule = config.designSystem?.componentsModule ?? null;
  const tokens = await loadTokens(projectRoot);
  const storyIndex = await loadStories(projectRoot);

  const finding: Finding = {
    ruleId: input.rule_id as RuleId,
    axis: "tokens", // any — codemod doesn't use this
    severity: "warning" as Severity,
    location: {
      file: filePath,
      line: input.line as number,
      column: typeof input.column === "number" ? (input.column as number) : 1,
    },
    message: synthesizeMessage(input.rule_id, source, input.line as number),
  };

  const ctx: RuleContext = {
    repoRoot: projectRoot,
    tokens,
    componentsModule,
    componentInventory: [],
    storyIndex,
    excludePaths: [],
  };

  return applyCodemod({ source, path: filePath, finding, ctx });
}
