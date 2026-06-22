import ansis from "ansis";

export interface UiOpts {
  color: boolean;
  unicode: boolean;
}

type Paint = (s: string, opts: UiOpts) => string;

const paint = (fn: (s: string) => string): Paint => (s, opts) => (opts.color ? fn(s) : s);

export const color = {
  brand: paint((s) => ansis.hex("#10b5a4")(s)),
  pass: paint((s) => ansis.green(s)),
  warn: paint((s) => ansis.yellow(s)),
  fail: paint((s) => ansis.red(s)),
  muted: paint((s) => ansis.dim(s)),
  bold: paint((s) => ansis.bold(s)),
} as const;

export const GLYPH = {
  pass: { uni: "✔", ascii: "v" },
  warn: { uni: "⚠", ascii: "!" },
  fail: { uni: "✘", ascii: "x" },
  pending: { uni: "◐", ascii: "*" },
  bullet: { uni: "●", ascii: "o" },
  caret: { uni: "❯", ascii: ">" },
  barFull: { uni: "█", ascii: "#" },
  barEmpty: { uni: "░", ascii: "-" },
} as const;

export type GlyphName = keyof typeof GLYPH;

export function glyph(name: GlyphName, opts: UiOpts): string {
  return opts.unicode ? GLYPH[name].uni : GLYPH[name].ascii;
}

export type Status = "pass" | "warn" | "fail" | "muted";

export function statusOf(score: number | "N/A"): Status {
  if (score === "N/A" || !Number.isFinite(score)) return "muted";
  if (score >= 70) return "pass";
  if (score >= 40) return "warn";
  return "fail";
}

const STATUS_PAINT: Record<Status, Paint> = {
  pass: color.pass,
  warn: color.warn,
  fail: color.fail,
  muted: color.muted,
};

export function statusColor(status: Status): Paint {
  return STATUS_PAINT[status];
}

export function statusGlyph(score: number | "N/A", opts: UiOpts): string {
  const status = statusOf(score);
  const name: GlyphName =
    status === "pass" ? "pass" : status === "warn" ? "warn" : status === "fail" ? "fail" : "bullet";
  return STATUS_PAINT[status](glyph(name, opts), opts);
}

export function bar(score: number | "N/A", opts: UiOpts, cells = 20): string {
  const full = glyph("barFull", opts);
  const empty = glyph("barEmpty", opts);
  if (score === "N/A" || !Number.isFinite(score)) return color.muted(empty.repeat(cells), opts);
  const clamped = Math.max(0, Math.min(100, score));
  const filled = Math.round((clamped / 100) * cells);
  return statusColor(statusOf(clamped))(full.repeat(filled), opts) + color.muted(empty.repeat(cells - filled), opts);
}
