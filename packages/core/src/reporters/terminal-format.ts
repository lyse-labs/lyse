import pc from "picocolors";
import stringWidth from "string-width";

export type TerminalMode = "default" | "quiet" | "verbose";

export interface TerminalOpts {
  mode: TerminalMode;
  color: boolean;
  unicode: boolean;
  width: number;
  outDir: string | undefined;
  fileCount: number;
  durationMs: number;
  cwd: string;
  /** When false/undefined, a "no token registry" educational hint is shown after the score. */
  hasTokenRegistry?: boolean;
  findingsLimit?: number | null;
}

const TRUECOLOR_TEAL_OPEN = "\x1b[38;2;16;181;164m";
const ANSI_RESET = "\x1b[0m";

export function teal(s: string, opts: TerminalOpts): string {
  return opts.color ? TRUECOLOR_TEAL_OPEN + s + ANSI_RESET : s;
}

export function thresholdColor(score: number | "N/A", opts: TerminalOpts): (s: string) => string {
  if (!opts.color || score === "N/A") return (s) => s;
  if (score >= 70) return pc.green;
  if (score >= 40) return pc.yellow;
  return pc.red;
}

export function severityColor(severity: "error" | "warning" | "info", opts: TerminalOpts): (s: string) => string {
  if (!opts.color) return (s) => s;
  if (severity === "error") return pc.red;
  if (severity === "warning") return pc.yellow;
  return pc.dim;
}

export function dim(s: string, opts: TerminalOpts): string {
  return opts.color ? pc.dim(s) : s;
}

export function bold(s: string, opts: TerminalOpts): string {
  return opts.color ? pc.bold(s) : s;
}

const FILL_UNI = "█"; // █
const EMPTY_UNI = "░"; // ░
const FILL_ASCII = "#";
const EMPTY_ASCII = "-";

export function bar(score: number | "N/A", opts: TerminalOpts, cells: number = 20): string {
  const fillChar = opts.unicode ? FILL_UNI : FILL_ASCII;
  const emptyChar = opts.unicode ? EMPTY_UNI : EMPTY_ASCII;
  if (score === "N/A" || !Number.isFinite(score)) return emptyChar.repeat(cells);
  const clamped = Math.max(0, Math.min(100, score));
  const filled = Math.round((clamped / 100) * cells);
  const empty = cells - filled;
  const colorize = thresholdColor(clamped, opts);
  return colorize(fillChar.repeat(filled)) + dim(emptyChar.repeat(empty), opts);
}

/**
 * Pads `text` to `targetWidth` visible columns. Uses string-width to count
 * visible characters, so it works correctly on ANSI-colored or OSC 8 strings.
 * For widths smaller than the visible text, returns the text unchanged.
 */
export function visiblePad(text: string, targetWidth: number, side: "left" | "right" = "right"): string {
  const visible = stringWidth(text);
  if (visible >= targetWidth) return text;
  const pad = " ".repeat(targetWidth - visible);
  return side === "right" ? text + pad : pad + text;
}

/**
 * Returns `text` if it fits within `maxWidth` visible columns. Otherwise
 * truncates from the START (keeping the most meaningful tail — file leaf,
 * line number) prefixed with `…`. Width-aware via string-width.
 */
export function truncateStart(text: string, maxWidth: number): string {
  if (maxWidth < 2) return text;
  const visible = stringWidth(text);
  if (visible <= maxWidth) return text;
  // Greedy from end: take chars while they fit (maxWidth - 1, leaving room for "…").
  const target = maxWidth - 1;
  let kept = "";
  for (let i = text.length - 1; i >= 0; i--) {
    const candidate = text.charAt(i) + kept;
    if (stringWidth(candidate) > target) break;
    kept = candidate;
  }
  return "…" + kept;
}

const DOT_UNI = "●"; // ●
const DOT_ASCII = "*";

export function statusDot(score: number | "N/A", opts: TerminalOpts): string {
  const glyph = opts.unicode ? DOT_UNI : DOT_ASCII;
  if (score === "N/A") return dim(glyph, opts);
  return thresholdColor(score, opts)(glyph);
}

const OSC_OPEN = "\x1b]8;;";
const OSC_CLOSE = "\x07";
const OSC_END = "\x1b]8;;\x07";

export function link(text: string, url: string, opts: TerminalOpts): string {
  if (!opts.color || !opts.unicode) return text;
  return OSC_OPEN + url + OSC_CLOSE + text + OSC_END;
}
