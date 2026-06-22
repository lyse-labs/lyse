import type { AuditResult } from "../types.js";
import { sortFindings } from "./finding-order.js";

const clean = (s: string): string => s.replace(/[\t\r\n]+/g, " ");

export function renderTsv(result: AuditResult): string {
  const sorted = [...result.findings].sort(sortFindings);
  if (sorted.length === 0) return "";
  const lines = sorted.map((f) =>
    [f.severity, f.ruleId, f.axis, f.location.file, String(f.location.line), String(f.location.column), clean(f.message)].join("\t"),
  );
  return lines.join("\n") + "\n";
}
