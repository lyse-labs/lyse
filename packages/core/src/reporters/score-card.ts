import type { AuditResult, AxisScore } from "../types.js";
import { statusGlyph } from "../ui/tokens.js";
import {
  bar, bold, dim, passColor, statusDot, thresholdColor, visiblePad, visibleWidth,
  type TerminalOpts,
} from "./terminal-format.js";

const OUTER_MAX = 64;
const OUTER_MIN = 44;
const EDGE = 3;

interface Borders { tl: string; tr: string; bl: string; br: string; h: string; v: string }
const UNICODE_BORDERS: Borders = { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" };
const ASCII_BORDERS: Borders = { tl: "+", tr: "+", bl: "+", br: "+", h: "-", v: "|" };

function axisRow(a: AxisScore, opts: TerminalOpts, barCells: number): string {
  const gly = statusGlyph(a.score, { color: opts.color, unicode: opts.unicode });
  const name = visiblePad(a.axis, 14);
  const scoreText = visiblePad(a.score === "N/A" ? "—" : String(a.score), 4, "left");
  return `${gly} ${name} ${scoreText}  ${bar(a.score, opts, barCells)}`;
}

/**
 * "↗ fix the top N drift groups → +M pts" — one line under the gauge when the
 * pipeline attached a positive-gain projection (Sprint 1 actionable findings,
 * design §1). Omitted entirely when `meta.projection` is absent or
 * `totalGainTop3` is 0 — presentation-only, never implies a score change.
 */
function projectionRow(result: AuditResult, opts: TerminalOpts): string | undefined {
  const projection = result.meta?.projection;
  if (!projection || projection.totalGainTop3 <= 0) return undefined;
  const leadGlyph = opts.unicode ? "↗" : "^";
  const midArrow = opts.unicode ? "→" : "->";
  const n = projection.top.length;
  const gain = projection.totalGainTop3;
  return (
    `${passColor(leadGlyph, opts)} ${dim(`fix the top ${n} drift groups`, opts)}` +
    ` ${passColor(midArrow, opts)} ${passColor(`+${gain} pts`, opts)}`
  );
}

export function renderScoreCard(
  result: AuditResult,
  opts: TerminalOpts,
  deltaSuffix?: string,
): string[] {
  const b = opts.unicode ? UNICODE_BORDERS : ASCII_BORDERS;
  const outer = Math.max(OUTER_MIN, Math.min(OUTER_MAX, opts.width));
  const inner = outer - 2;
  const wrap = (s: string) => `${b.v}${visiblePad(` `.repeat(EDGE - 1) + s, inner)}${b.v}`;
  const blank = `${b.v}${" ".repeat(inner)}${b.v}`;

  const score = result.finalScore;
  const grade = result.grade && result.grade.grade !== "N/A" ? `${result.grade.grade}  ` : "";
  const head = score === "N/A" ? bold("N/A", opts) : bold(thresholdColor(score, opts)(`${grade}${score}/100`), opts);
  // Geometry is asymmetric, not a mirrored EDGE-on-both-sides margin: wrap()'s
  // left inset is EDGE-1 (2 columns), while fits() budgets EDGE+EDGE (3+3) of
  // the inner width, so the right-hand margin is >=4 columns in the worst case
  // (content sized right up to the fits() limit) and wider whenever content is
  // shorter. A long grade name plus "(auto-fail)" plus the subtitle can outgrow
  // OUTER_MIN (44), so the annotation and subtitle are dropped — in that
  // priority order — rather than letting the row overflow the border.
  const fits = (s: string) => inner - EDGE - visibleWidth(s) - EDGE >= 0;
  let scoreRow = `${statusDot(score, opts)}  ${head}`;
  if (result.grade?.autoFailed) {
    const withAutoFail = `${scoreRow}  ${dim("(auto-fail)", opts)}`;
    if (fits(withAutoFail)) scoreRow = withAutoFail;
  }
  const withSubtitle = `${scoreRow}   ${dim("design system health", opts)}`;
  if (fits(withSubtitle)) scoreRow = withSubtitle;
  if (deltaSuffix) {
    const delta = dim(deltaSuffix, opts);
    const room = inner - EDGE - visibleWidth(scoreRow) - visibleWidth(delta) - EDGE;
    if (room >= 1) scoreRow = `${scoreRow}${" ".repeat(room)}${delta}`;
  }

  const gaugeCells = Math.min(40, inner - 2 * EDGE);
  const barCells = Math.min(20, inner - EDGE - 24);
  // Same fits()-style guard as the score row, but budgeted against wrap()'s
  // actual left inset (EDGE-1) rather than the doubly-conservative EDGE+EDGE
  // margin `fits()` reserves for the score row — the projection line has no
  // trailing content (no delta suffix) competing for the right margin, so it
  // only needs to not overflow the border, not leave room for anything else.
  const rawProjRow = projectionRow(result, opts);
  const projRowFits = (s: string) => inner - (EDGE - 1) - visibleWidth(s) >= 0;
  const projRow = rawProjRow !== undefined && projRowFits(rawProjRow) ? rawProjRow : undefined;

  return [
    `${b.tl}${b.h.repeat(inner)}${b.tr}`,
    blank,
    wrap(scoreRow),
    wrap(bar(score, opts, gaugeCells)),
    ...(projRow !== undefined ? [wrap(projRow)] : []),
    blank,
    // Every scored axis renders, N/A included — ai-surface/ai-governance were
    // invisible pre-card while still moving the score; do not "clean up" N/A rows.
    ...result.axes.map((a) => wrap(axisRow(a, opts, barCells))),
    blank,
    `${b.bl}${b.h.repeat(inner)}${b.br}`,
  ];
}
