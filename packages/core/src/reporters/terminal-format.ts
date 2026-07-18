import stringWidth from "string-width";
import { color, glyph, statusOf, statusColor, bar as tokenBar, type UiOpts } from "../ui/tokens.js";

type TerminalMode = "default" | "quiet" | "verbose";

export interface TerminalOpts {
  mode: TerminalMode;
  color: boolean;
  unicode: boolean;
  width: number;
  outDir: string | undefined;
  fileCount: number;
  durationMs: number;
  cwd: string;
  hasTokenRegistry?: boolean;
  findingsLimit?: number | null;
  /** Suppress contextual nags (static-only LLM banner, "run lyse init" hint) — set when rendering from inside `lyse init`. */
  suppressNags?: boolean;
  /** Configured `advisory.migrationScaleFileCount` threshold (falls back to `MIGRATION_SCALE_FILE_COUNT_DEFAULT` when absent). */
  migrationScaleFileCount?: number;
}

const ui = (opts: TerminalOpts): UiOpts => ({ color: opts.color, unicode: opts.unicode });

export function teal(s: string, opts: TerminalOpts): string {
  return color.brand(s, ui(opts));
}

export function thresholdColor(score: number | "N/A", opts: TerminalOpts): (s: string) => string {
  if (!opts.color || score === "N/A") return (s) => s;
  const paint = statusColor(statusOf(score));
  return (s) => paint(s, ui(opts));
}

export function severityColor(
  severity: "error" | "warning" | "info",
  opts: TerminalOpts,
): (s: string) => string {
  if (!opts.color) return (s) => s;
  const paint = severity === "error" ? color.fail : severity === "warning" ? color.warn : color.muted;
  return (s) => paint(s, ui(opts));
}

export function dim(s: string, opts: TerminalOpts): string {
  return color.muted(s, ui(opts));
}

export function passColor(s: string, opts: TerminalOpts): string {
  return color.pass(s, ui(opts));
}

export function warnColor(s: string, opts: TerminalOpts): string {
  return color.warn(s, ui(opts));
}

export function bold(s: string, opts: TerminalOpts): string {
  return color.bold(s, ui(opts));
}

export function bar(score: number | "N/A", opts: TerminalOpts, cells = 20): string {
  return tokenBar(score, ui(opts), cells);
}

/**
 * Visible-column width of `text`. Uses string-width to count visible
 * characters, so it works correctly on ANSI-colored or OSC 8 strings.
 */
export function visibleWidth(text: string): number {
  return stringWidth(text);
}

/**
 * Pads `text` to `targetWidth` visible columns. For widths smaller than the
 * visible text, returns the text unchanged.
 */
export function visiblePad(text: string, targetWidth: number, side: "left" | "right" = "right"): string {
  const visible = visibleWidth(text);
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
  const target = maxWidth - 1;
  let kept = "";
  for (let i = text.length - 1; i >= 0; i--) {
    const candidate = text.charAt(i) + kept;
    if (stringWidth(candidate) > target) break;
    kept = candidate;
  }
  return "…" + kept;
}

export function statusDot(score: number | "N/A", opts: TerminalOpts): string {
  return statusColor(statusOf(score))(glyph("bullet", ui(opts)), ui(opts));
}

const OSC_OPEN = "\x1b]8;;";
const OSC_CLOSE = "\x07";
const OSC_END = "\x1b]8;;\x07";

export function link(text: string, url: string, opts: TerminalOpts): string {
  if (!opts.color || !opts.unicode) return text;
  return OSC_OPEN + url + OSC_CLOSE + text + OSC_END;
}
