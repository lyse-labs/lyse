import type { Finding } from "../types.js";

export const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const;

export function sortFindings(a: Finding, b: Finding): number {
  if (a.severity !== b.severity) return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
  if (a.location.file !== b.location.file) return a.location.file < b.location.file ? -1 : 1;
  if (a.location.line !== b.location.line) return a.location.line - b.location.line;
  if (a.location.column !== b.location.column) return a.location.column - b.location.column;
  return a.ruleId < b.ruleId ? -1 : 1;
}
