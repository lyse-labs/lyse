import type { AuditResult, Finding, AxisScore } from "../types.js";
import { formatCoverageFooter } from "./coverage-footer.js";
import { readRecent, computeDelta, type AuditEvent } from "../history/ndjson-store.js";
import {
  teal, thresholdColor, severityColor, dim, bold, bar, statusDot, link,
  visiblePad, truncateStart,
  type TerminalOpts,
} from "./terminal-format.js";
import { statusGlyph } from "../ui/tokens.js";
import { brandHeader } from "../ui/banner.js";

export type { TerminalOpts } from "./terminal-format.js";

const AXES_ORDER = ["tokens", "a11y", "components", "stories"] as const;

const AXIS_NAME_WIDTH = 12;
const AXIS_SCORE_WIDTH = 5;
const RULE_ID_WIDTH = 34;
const FINDING_NUM_WIDTH = 2;

function header(result: AuditResult, opts: TerminalOpts): string {
  const ui = { color: opts.color, unicode: opts.unicode };
  const subtitle = opts.fileCount > 0 ? `${opts.fileCount} files · ${(opts.durationMs / 1000).toFixed(1)}s` : "";
  return brandHeader(result.toolVersion, subtitle, ui);
}

function scoreLine(result: AuditResult, opts: TerminalOpts, deltaSuffix?: string): string {
  const score = result.finalScore;
  const dot = statusDot(score, opts);
  const sub = dim("design system health", opts);
  if (score === "N/A") {
    return `  ${dot}  ${bold("N/A", opts)}   ${sub}`;
  }
  const grade = result.grade && result.grade.grade !== "N/A" ? `${result.grade.grade}  ` : "";
  const head = bold(thresholdColor(score, opts)(`${grade}${score}/100`), opts);
  const autoFail = result.grade?.autoFailed ? `  ${dim("(auto-fail)", opts)}` : "";
  const delta = deltaSuffix ? `  ${dim(deltaSuffix, opts)}` : "";
  return `  ${dot}  ${head}${autoFail}${delta}   ${sub}`;
}

function axisLine(a: AxisScore, opts: TerminalOpts): string {
  const gly = statusGlyph(a.score, { color: opts.color, unicode: opts.unicode });
  const name = visiblePad(a.axis, AXIS_NAME_WIDTH);
  const scoreText = visiblePad(a.score === "N/A" ? "—" : String(a.score), AXIS_SCORE_WIDTH, "left");
  const barViz = bar(a.score, opts, 20);
  return `  ${gly} ${name}  ${scoreText}  ${barViz}`;
}

function findingLines(f: Finding, index: number, opts: TerminalOpts): string[] {
  const num = visiblePad(dim(String(index), opts), FINDING_NUM_WIDTH, "left");
  const ruleColored = severityColor(f.severity, opts)(f.ruleId);
  const ruleLinked = link(ruleColored, `https://github.com/lyse-labs/lyse/blob/main/docs/rules/${f.ruleId}`, opts);
  const rulePadded = visiblePad(ruleLinked, RULE_ID_WIDTH);
  // Width-aware truncation of file:line. Available width = total width - the prefix columns.
  // Prefix = 2 spaces + num (2) + 2 spaces + rule (34) + 2 spaces = ~42 chars.
  const locMaxWidth = Math.max(20, opts.width - 42);
  const locText = `${f.location.file}:${f.location.line}`;
  const locTruncated = truncateStart(locText, locMaxWidth);
  const locLinked = link(locTruncated, `file://${f.location.file}:${f.location.line}`, opts);
  const arrow = teal("->", opts);
  const detail = f.suggestion ? `${f.message}  ${arrow}  ${f.suggestion}` : f.message;
  return [
    `  ${num}  ${rulePadded}  ${dim(locLinked, opts)}`,
    `      ${dim(detail, opts)}`,
    "",
  ];
}

function topFindings(findings: Finding[], opts: TerminalOpts): string[] {
  if (findings.length === 0) return [];
  const explicit = opts.findingsLimit;
  const limit =
    explicit === null
      ? findings.length
      : typeof explicit === "number"
        ? explicit
        : opts.mode === "verbose"
          ? findings.length
          : 5;
  const shown = findings.slice(0, limit);
  const lines: string[] = ["", bold("  Top findings", opts), ""];
  shown.forEach((f, i) => lines.push(...findingLines(f, i + 1, opts)));
  const remaining = findings.length - shown.length;
  if (remaining > 0) {
    const moreMsg = opts.outDir
      ? `${remaining} more findings  ·  full list in ${opts.outDir}/lyse.json`
      : `${remaining} more findings  ·  use --output <dir> for the full JSON report`;
    lines.push(`     ${dim(moreMsg, opts)}`);
    lines.push("");
  }
  return lines;
}

function nextSteps(result: AuditResult, opts: TerminalOpts): string[] {
  const tips: string[] = [];
  const axisBy = new Map(result.axes.map((a) => [a.axis, a]));
  const tokens = axisBy.get("tokens");
  const components = axisBy.get("components");
  const stories = axisBy.get("stories");
  const a11y = axisBy.get("a11y");

  if (tokens !== undefined && tokens.score !== "N/A" && tokens.score < 70) {
    tips.push(`Run \`lyse agents-md > AGENTS.md\` and commit it  ${dim("·", opts)}  give your AI agents your token namespaces`);
  }
  if (components !== undefined && components.score !== "N/A" && components.score < 70) {
    tips.push(`Audit native <button>/<input>/<a> usage in your highest-traffic files`);
  }
  if (a11y !== undefined && a11y.score !== "N/A" && a11y.score < 70) {
    tips.push(`Run \`eslint --fix\` with eslint-plugin-jsx-a11y to auto-fix trivial a11y warnings`);
  }
  if (stories !== undefined && stories.score !== "N/A" && stories.score < 70) {
    const jsonPath = opts.outDir ? `${opts.outDir}/lyse.json` : "lyse.json (use --output <dir>)";
    tips.push(`Add stories for orphan DS components listed in ${jsonPath}`);
  }
  if (tips.length === 0) return [];
  const arrow = teal("->", opts);
  return ["", bold("  Next steps", opts), "", ...tips.map((t) => `   ${arrow}  ${t}`), ""];
}

function footer(result: AuditResult, opts: TerminalOpts): string {
  const sep = dim("·", opts);
  const meta = `github.com/lyse-labs/lyse/blob/main/docs/rules  ${sep}  scanned ${result.timestamp.slice(0, 16)}Z`;
  if (opts.outDir) {
    const paths = `${opts.outDir}/lyse.json`;
    return `\n  ${dim(paths, opts)}\n  ${dim(meta, opts)}`;
  }
  return `\n  ${dim(meta, opts)}`;
}

export async function renderTerminal(result: AuditResult, opts: TerminalOpts): Promise<string> {
  const lines: string[] = [""];
  lines.push(header(result, opts));
  lines.push("", "");

  // Compute delta for score line
  let deltaSuffix: string | undefined;
  try {
    const recent = await readRecent(opts.cwd, 10);
    const audits = recent.filter((e) => e.event_type === "audit") as AuditEvent[];
    if (audits.length >= 2) {
      const prev = audits[audits.length - 2]; // previous audit (this audit may not be in file yet)
      if (prev) {
        const tokensScore = result.axes.find((a) => a.axis === "tokens")?.score;
        const a11yScore = result.axes.find((a) => a.axis === "a11y")?.score;
        const componentsScore = result.axes.find((a) => a.axis === "components")?.score;
        const storiesScore = result.axes.find((a) => a.axis === "stories")?.score;

        const delta = computeDelta(
          {
            score: typeof result.finalScore === "number" ? result.finalScore : 0,
            axes: {
              tokens: typeof tokensScore === "number" ? tokensScore : null,
              a11y: typeof a11yScore === "number" ? a11yScore : null,
              components: typeof componentsScore === "number" ? componentsScore : null,
              stories: typeof storiesScore === "number" ? storiesScore : null,
            },
            findings_count: result.findings.length,
          },
          prev
        );
        if (delta.score !== 0) {
          const arrow = delta.score > 0 ? "▲" : "▼";
          deltaSuffix = `${arrow} ${Math.abs(delta.score)}`;
        }
      }
    }
  } catch {
    // silently ignore history read errors
  }

  lines.push(scoreLine(result, opts, deltaSuffix));

  // Layer 4 banners — shown immediately after the score line. In v0.1.0
  // `llm/layer4-stage.ts` is a stub that only ever sets `staticOnly: true`,
  // so the cacheHit / usdSpent / error branches below cannot fire from
  // production input. They're gated behind `LYSE_LAYER4_ENABLED` so the
  // renderer doesn't carry inert branches in the user-visible code path,
  // but the rendering contract stays in tree for when Layer 4 lands.
  const layer4 = result.meta?.layer4;
  if (layer4) {
    if (layer4.staticOnly && !opts.suppressNags) {
      lines.push("");
      lines.push(
        `  ${opts.color ? "\x1b[33m" : ""}⚠ Static-only mode: every LLM path is off. Set ANTHROPIC_API_KEY or OPENAI_API_KEY and remove --static-only to enable optional LLM augmentation.${opts.color ? "\x1b[0m" : ""}`,
      );
    }
    if (process.env["LYSE_LAYER4_ENABLED"]) {
      if (layer4.cacheHit) {
        lines.push("");
        lines.push(
          `  ${dim("(cached LLM augmentation — re-running on the same commit hits the cache)", opts)}`,
        );
      } else if (!layer4.staticOnly && layer4.usdSpent !== undefined && layer4.modelUsed) {
        lines.push("");
        lines.push(
          `  ${dim(`LLM augmentation: ${layer4.modelUsed}, $${layer4.usdSpent.toFixed(2)} (your account)`, opts)}`,
        );
      }
      if (layer4.error) {
        lines.push("");
        lines.push(
          `  ${opts.color ? "\x1b[31m" : ""}⚠ LLM unreachable — comprehensive score unavailable: ${layer4.error.message}${opts.color ? "\x1b[0m" : ""}`,
        );
      }
    }
  }

  // Educational hint: no token registry means tokens + components axes fly blind
  // (spec T28 dogfood fix). Shown only when hasTokenRegistry is absent/false,
  // and only in human-readable mode (caller skips this for json/sarif by not
  // calling renderTerminal at all).
  if (!opts.hasTokenRegistry && !opts.suppressNags) {
    lines.push("");
    lines.push(`  ${dim("No token registry detected — run \`lyse init\` for a calibrated score.", opts)}`);
  }

  lines.push("", "");
  for (const axisName of AXES_ORDER) {
    const a = result.axes.find((ax) => ax.axis === axisName);
    if (a !== undefined) lines.push(axisLine(a, opts));
  }
  if (opts.mode !== "quiet") {
    lines.push(...topFindings(result.findings, opts));
    lines.push(...nextSteps(result, opts));
  }
  if (result.meta?.coverage) {
    lines.push("", `  ${dim(formatCoverageFooter(result.meta.coverage), opts)}`);
  }
  lines.push(footer(result, opts));
  return lines.join("\n");
}
