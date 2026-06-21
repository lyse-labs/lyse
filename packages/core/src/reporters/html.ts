import type { AuditResult, AxisScore, Finding } from "../types.js";

// Grade → color, kept in sync with share/badge.ts so the report and the badge
// read the same visually.
const GRADE_COLOR: Record<string, string> = {
  A: "#2da44e",
  B: "#3fb950",
  C: "#d4a72c",
  Fail: "#cf222e",
  "N/A": "#8c959f",
};

const SEVERITY_ORDER: Record<string, number> = { error: 0, warning: 1, warn: 1, info: 2 };
const MAX_ROWS = 200;

function esc(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sortFindings(a: Finding, b: Finding): number {
  const sa = SEVERITY_ORDER[a.severity] ?? 9;
  const sb = SEVERITY_ORDER[b.severity] ?? 9;
  if (sa !== sb) return sa - sb;
  if (a.location.file !== b.location.file) return a.location.file < b.location.file ? -1 : 1;
  if (a.location.line !== b.location.line) return a.location.line - b.location.line;
  if (a.location.column !== b.location.column) return a.location.column - b.location.column;
  return a.ruleId < b.ruleId ? -1 : 1;
}

function scoreText(score: number | "N/A"): string {
  return score === "N/A" ? "N/A" : String(score);
}

function axisRow(a: AxisScore): string {
  const pct = typeof a.score === "number" ? Math.max(0, Math.min(100, a.score)) : 0;
  const label = scoreText(a.score);
  return `<tr>
    <td class="axis">${esc(a.axis)}</td>
    <td class="barcell"><span class="bar" style="width:${pct}%"></span></td>
    <td class="score">${esc(label)}</td>
    <td class="cnt">${esc(a.findings)} findings</td>
  </tr>`;
}

function findingRow(f: Finding): string {
  const loc = `${f.location.file}:${f.location.line}`;
  const sug = f.suggestion ? `<div class="sug">${esc(f.suggestion)}</div>` : "";
  return `<tr class="sev-${esc(f.severity)}">
    <td class="sev">${esc(f.severity)}</td>
    <td class="rule">${esc(f.ruleId)}</td>
    <td class="loc">${esc(loc)}</td>
    <td class="msg">${esc(f.message)}${sug}</td>
  </tr>`;
}

export function renderHtml(result: AuditResult, opts: { includeTimestamp?: boolean } = {}): string {
  const grade = result.grade?.grade ?? "N/A";
  const color = GRADE_COLOR[grade] ?? GRADE_COLOR["N/A"];
  const score = scoreText(result.finalScore);
  const autoFail = result.grade?.autoFailed
    ? `<div class="autofail">Auto-fail: ${esc((result.grade.reasons ?? []).join("; "))}</div>`
    : "";

  const axesRows = result.axes.map(axisRow).join("\n");

  const sorted = [...result.findings].sort(sortFindings);
  const shown = sorted.slice(0, MAX_ROWS);
  const more = sorted.length - shown.length;
  const findingsBody =
    sorted.length === 0
      ? `<tr><td colspan="4" class="none">No findings 🎉</td></tr>`
      : shown.map(findingRow).join("\n");
  const moreNote =
    more > 0
      ? `<p class="more">…and ${more} more — use <code>--format=json</code> for the full set.</p>`
      : "";

  const ts = opts.includeTimestamp ? ` · ${esc(result.timestamp)}` : "";
  const footer = `lyse ${esc(result.toolVersion)} · scoring ${esc(result.scoringVersion)} · rules ${esc(result.rulesVersion)}${ts}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lyse Health Score — ${esc(score)}/100 (${esc(grade)})</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1f2328; background: #fff; }
  .wrap { max-width: 880px; margin: 0 auto; padding: 32px 20px; }
  header { display: flex; align-items: center; gap: 20px; border-bottom: 1px solid #d0d7de; padding-bottom: 20px; }
  .gauge { width: 96px; height: 96px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-direction: column; color: #fff; background: ${color}; flex: 0 0 auto; }
  .gauge .num { font-size: 30px; font-weight: 700; line-height: 1; }
  .gauge .of { font-size: 12px; opacity: .85; }
  .grade { font-size: 22px; font-weight: 700; }
  .sub { color: #656d76; font-size: 13px; }
  .autofail { color: ${GRADE_COLOR["Fail"]}; font-weight: 600; margin-top: 4px; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .04em; color: #656d76; margin: 28px 0 8px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 6px 8px; border-bottom: 1px solid #eaeef2; vertical-align: top; }
  .axis { font-weight: 600; width: 120px; }
  .barcell { width: 50%; }
  .bar { display: block; height: 10px; border-radius: 5px; background: ${color}; min-width: 2px; }
  .score { text-align: right; width: 48px; font-variant-numeric: tabular-nums; }
  .cnt { color: #656d76; text-align: right; white-space: nowrap; }
  .sev { text-transform: uppercase; font-size: 11px; font-weight: 700; width: 64px; }
  .sev-error .sev { color: ${GRADE_COLOR["Fail"]}; }
  .sev-warning .sev, .sev-warn .sev { color: ${GRADE_COLOR["C"]}; }
  .sev-info .sev { color: #656d76; }
  .rule { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; white-space: nowrap; }
  .loc { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: #656d76; white-space: nowrap; }
  .sug { color: #656d76; font-size: 13px; margin-top: 2px; }
  .none { text-align: center; color: #656d76; padding: 20px; }
  .more { color: #656d76; font-size: 13px; }
  footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #d0d7de; color: #656d76; font-size: 12px; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="gauge"><span class="num">${esc(score)}</span><span class="of">/ 100</span></div>
    <div>
      <div class="grade">Grade ${esc(grade)}</div>
      <div class="sub">Lyse Health Score · ${esc(result.stack.join(", ") || "design system")}</div>
      ${autoFail}
    </div>
  </header>

  <h2>Axes</h2>
  <table>${axesRows}</table>

  <h2>Findings (${sorted.length})</h2>
  <table>
    <tr><td class="sev">Sev</td><td class="rule">Rule</td><td class="loc">Location</td><td class="msg">Message</td></tr>
    ${findingsBody}
  </table>
  ${moreNote}

  <footer>${footer}</footer>
</div>
</body>
</html>
`;
}
