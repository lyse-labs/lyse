import type { AuditResult, Finding } from "../types.js";
import { sortFindings } from "./finding-order.js";
import { severityColor, dim, bold, visiblePad, truncateStart, type TerminalOpts } from "./terminal-format.js";

const SEVERITY_WIDTH = 8;
const RULE_WIDTH = 36;
const LOCATION_WIDTH = 24;

function row(f: Finding, opts: TerminalOpts): string {
  const sev = visiblePad(severityColor(f.severity, opts)(f.severity), SEVERITY_WIDTH);
  const rule = visiblePad(f.ruleId, RULE_WIDTH);
  const loc = visiblePad(truncateStart(`${f.location.file}:${f.location.line}`, LOCATION_WIDTH), LOCATION_WIDTH);
  const used = SEVERITY_WIDTH + RULE_WIDTH + LOCATION_WIDTH + 3;
  const msgWidth = Math.max(10, opts.width - used);
  const msg = truncateStart(f.message, msgWidth);
  return ` ${sev} ${rule} ${loc} ${msg}`;
}

export function renderTable(result: AuditResult, opts: TerminalOpts): string {
  const sorted = [...result.findings].sort(sortFindings);
  if (sorted.length === 0) {
    return `\n ${dim("No findings.", opts)}\n`;
  }
  const limit = opts.findingsLimit ?? sorted.length;
  const shown = sorted.slice(0, limit);
  const header = ` ${bold(visiblePad("SEVERITY", SEVERITY_WIDTH), opts)} ${bold(visiblePad("RULE", RULE_WIDTH), opts)} ${bold(visiblePad("LOCATION", LOCATION_WIDTH), opts)} ${bold("MESSAGE", opts)}`;
  const lines = [header, ...shown.map((f) => row(f, opts))];
  const remaining = sorted.length - shown.length;
  if (remaining > 0) {
    lines.push(` ${dim(`… ${remaining} more (use --limit=all)`, opts)}`);
  }
  return lines.join("\n") + "\n";
}
