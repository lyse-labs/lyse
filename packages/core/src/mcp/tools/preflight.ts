import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { runAuditFile } from "./audit-file.js";
import { stableRuleIds } from "../../reliability/score/stable-sub-axes.js";
import { SUB_AXES } from "../../reliability/catalogue/sub-axes.js";

/** A single finding in the pre-flight verdict (mirrors audit_file violations). */
export interface PreflightViolation {
  rule_id: string;
  severity: "error" | "warning" | "info";
  range: { line: number; column: number };
  message: string;
  suggestion_available: boolean;
  suggestion?: string;
}

export interface PreflightResult {
  schema_version: "1.0.0";
  /** `blocked` = at least one stable-rule violation; `pass` = none; `error` = tool error. */
  verdict: "pass" | "blocked" | "error";
  /** Stable-rule violations — these block the write. */
  blocking: PreflightViolation[];
  /** Experimental-rule violations — advisory only, never block. */
  advisory: PreflightViolation[];
  summary: string;
}

interface PreflightInput {
  path?: unknown;
  content?: unknown;
  project_root?: unknown;
}

export const preflightTool: Tool = {
  name: "preflight_diff",
  description:
    "Validate a proposed file edit BEFORE it lands. Pass the file `path` and the full proposed `content` (the post-edit buffer); Lyse audits it and returns a verdict. Only STABLE design-system rules can `block`; experimental rules are advisory. Use this as a compiler-style guardrail before writing agent-generated code.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the file being edited (relative or absolute)." },
      content: {
        type: "string",
        description: "The full proposed file content (post-edit buffer) to validate before writing.",
      },
      project_root: {
        type: "string",
        description: "Optional project root for config/token resolution. Defaults to the dir of `path`.",
      },
    },
    required: ["path", "content"],
  },
  outputSchema: {
    type: "object",
    properties: {
      schema_version: { type: "string", const: "1.0.0" },
      verdict: { type: "string", enum: ["pass", "blocked", "error"] },
      blocking: { type: "array", items: { type: "object" } },
      advisory: { type: "array", items: { type: "object" } },
      summary: { type: "string" },
    },
    required: ["schema_version", "verdict", "blocking", "advisory", "summary"],
  },
};

/**
 * Partitions audit violations into blocking (stable rule) and advisory
 * (experimental rule). Verdict is `blocked` iff any stable-rule violation
 * exists. Pure — the policy core of the pre-flight guardrail.
 */
export function classifyPreflight(
  violations: PreflightViolation[],
  stableRules: ReadonlySet<string>,
): { verdict: "pass" | "blocked"; blocking: PreflightViolation[]; advisory: PreflightViolation[] } {
  const blocking: PreflightViolation[] = [];
  const advisory: PreflightViolation[] = [];
  for (const v of violations) {
    if (stableRules.has(v.rule_id)) blocking.push(v);
    else advisory.push(v);
  }
  return { verdict: blocking.length > 0 ? "blocked" : "pass", blocking, advisory };
}

export async function runPreflight(input: PreflightInput): Promise<PreflightResult> {
  if (typeof input.content !== "string") {
    return {
      schema_version: "1.0.0",
      verdict: "error",
      blocking: [],
      advisory: [],
      summary: "`content` argument is required — pass the full proposed file content to validate.",
    };
  }

  const audit = await runAuditFile({
    path: input.path,
    content: input.content,
    ...(typeof input.project_root === "string" ? { project_root: input.project_root } : {}),
  });

  // The single-file audit returns a synthetic `internal` finding for tool-level
  // problems (missing path, unreadable, unsupported type) — surface as `error`.
  const toolError = audit.violations.find((v) => v.rule_id === "internal");
  if (toolError) {
    return {
      schema_version: "1.0.0",
      verdict: "error",
      blocking: [],
      advisory: [],
      summary: toolError.message,
    };
  }

  // filterRan is false on the single-file path (the LLM filter is a full-audit
  // stage), so the stable set is the calibrated base set.
  const stable = stableRuleIds(SUB_AXES, { filterRan: false });
  const { verdict, blocking, advisory } = classifyPreflight(audit.violations, stable);

  const summary =
    verdict === "blocked"
      ? `Blocked: ${blocking.length} stable-rule violation${blocking.length !== 1 ? "s" : ""}` +
        (advisory.length > 0 ? ` (+ ${advisory.length} advisory)` : "") +
        `. Fix the blocking findings before writing.`
      : advisory.length > 0
        ? `Pass with ${advisory.length} advisory finding${advisory.length !== 1 ? "s" : ""} (experimental rules — not blocking).`
        : "Pass: no design-system violations in the proposed edit.";

  return { schema_version: "1.0.0", verdict, blocking, advisory, summary };
}
