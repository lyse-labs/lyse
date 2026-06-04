import type { Finding as LegacyFinding } from "../../types.js";

export interface EslintStyleFinding {
  ruleId: string;
  severity: "error" | "warning" | "info" | "warn";
  message: string;
  file: string;
  line: number | null;
  column?: number | null;
  confidence?: "high" | "medium" | "low";
}

export interface RenderInput {
  findings: EslintStyleFinding[];
  counted: number;
  experimental: number;
  limit?: number | null;
}

const LOC_WIDTH = 40;
const TAG_WIDTH = 8;

function normalizeSeverity(s: string): string {
  if (s === "warn") return "warning";
  return s;
}

export function fromLegacyFinding(f: LegacyFinding): EslintStyleFinding {
  const out: EslintStyleFinding = {
    ruleId: f.ruleId,
    severity: f.severity,
    message: f.message,
    file: f.location.file,
    line: f.location.line,
    column: f.location.column,
  };
  if (f.confidence !== undefined) out.confidence = f.confidence;
  return out;
}

export function renderEslintStyle(input: RenderInput): string {
  if (input.findings.length === 0) {
    return "";
  }
  const total = input.findings.length;
  const limit = input.limit === undefined || input.limit === null ? total : input.limit;
  const shown = input.findings.slice(0, limit);
  const lines: string[] = [];
  for (const f of shown) {
    const loc = `${f.file}:${f.line ?? "?"}:${f.column ?? "?"}`;
    const tag = f.confidence === "low" ? "EXP" : normalizeSeverity(f.severity).toUpperCase();
    lines.push(`  ${loc.padEnd(LOC_WIDTH)} ${tag.padEnd(TAG_WIDTH)} ${f.ruleId}`);
    if (f.message) lines.push(`    ${f.message}`);
  }
  const remaining = total - shown.length;
  if (remaining > 0) {
    lines.push(`  … ${remaining} more findings (use --limit=all to show every finding, or --format=json for the full report)`);
  }
  return lines.join("\n");
}
