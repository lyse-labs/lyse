import type { AuditResult, Finding, ProjectionMeta } from "../types.js";
import { formatCoverageFooter } from "./coverage-footer.js";
import { readRecent, computeDelta, type AuditEvent } from "../history/ndjson-store.js";
import {
  teal, severityColor, dim, bold, link, warnColor,
  visiblePad, truncateStart,
  type TerminalOpts,
} from "./terminal-format.js";
import { brandHeader } from "../ui/banner.js";
import { renderScoreCard } from "./score-card.js";
import { groupFindings, MIGRATION_SCALE_FILE_COUNT_DEFAULT, type FindingGroup } from "../report/fix-groups.js";

export type { TerminalOpts } from "./terminal-format.js";

const RULE_ID_WIDTH = 34;
const FINDING_NUM_WIDTH = 2;

/** Rule doc files are dash-named (e.g. `tokens/no-hardcoded-color` -> `docs/rules/tokens-no-hardcoded-color.md`). */
function ruleDocsUrl(ruleId: string): string {
  return `https://github.com/lyse-labs/lyse/blob/main/docs/rules/${ruleId.replace(/\//g, "-")}.md`;
}

function header(result: AuditResult, opts: TerminalOpts): string {
  const ui = { color: opts.color, unicode: opts.unicode };
  const subtitle = opts.fileCount > 0 ? `${opts.fileCount} files · ${(opts.durationMs / 1000).toFixed(1)}s` : "";
  return brandHeader(result.toolVersion, subtitle, ui);
}

function findingLines(f: Finding, index: number, opts: TerminalOpts): string[] {
  const num = visiblePad(dim(String(index), opts), FINDING_NUM_WIDTH, "left");
  const ruleColored = severityColor(f.severity, opts)(f.ruleId);
  const ruleLinked = link(ruleColored, ruleDocsUrl(f.ruleId), opts);
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

/**
 * Ranks fix groups for the default-mode grouped view (design §2): groups
 * named in `projection.top` come first, in that order (a reader who saw the
 * card's "fix the top N" line finds the same groups at the top of the list);
 * the rest keep `groupFindings`'s own count-desc/severity-asc/key-asc order,
 * computed against `opts.migrationScaleFileCount` (falling back to the
 * default) so a custom `advisory.migrationScaleFileCount` also governs
 * groups not named in the projection. Named groups still adopt the
 * pipeline's `migrationScale` flag directly — the pipeline flag is
 * authoritative since it was computed alongside the rest of `projection.top`.
 */
function rankedGroups(findings: Finding[], projection: ProjectionMeta | undefined, opts: TerminalOpts): FindingGroup[] {
  const groups = groupFindings(findings, opts.migrationScaleFileCount ?? MIGRATION_SCALE_FILE_COUNT_DEFAULT);
  if (!projection || projection.top.length === 0) return groups;
  const projectedByKey = new Map(projection.top.map((e) => [e.key, e]));
  const withOverrides = groups.map((g) => {
    const entry = projectedByKey.get(g.key);
    return entry && entry.migrationScale !== g.migrationScale ? { ...g, migrationScale: entry.migrationScale } : g;
  });
  const orderByKey = new Map(projection.top.map((e, i) => [e.key, i]));
  return [...withOverrides].sort((a, b) => {
    const ai = orderByKey.get(a.key);
    const bi = orderByKey.get(b.key);
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return 0; // stable sort — preserves groupFindings' own count-desc/key-asc order
  });
}

function groupLines(group: FindingGroup, index: number, opts: TerminalOpts): string[] {
  const rep = group.findings[0]!;
  const count = group.findings.length;
  const num = visiblePad(dim(String(index), opts), FINDING_NUM_WIDTH, "left");
  const ruleColored = severityColor(rep.severity, opts)(group.ruleId);
  const ruleLinked = link(ruleColored, ruleDocsUrl(group.ruleId), opts);
  const countTag = count > 1 ? ` ${dim(`×${count}`, opts)}` : "";
  const rulePadded = visiblePad(`${ruleLinked}${countTag}`, RULE_ID_WIDTH);

  const locMaxWidth = Math.max(20, opts.width - 42);
  const locText = `${rep.location.file}:${rep.location.line}`;
  const locTruncated = truncateStart(locText, locMaxWidth);
  const locLinked = link(locTruncated, `file://${rep.location.file}:${rep.location.line}`, opts);
  const sitesSuffix = count > 1 ? `  ${dim(`and ${count - 1} more sites`, opts)}` : "";

  const arrow = teal("->", opts);
  const detail = rep.suggestion ? `${rep.message}  ${arrow}  ${rep.suggestion}` : rep.message;

  const lines = [
    `  ${num}  ${rulePadded}  ${dim(locLinked, opts)}${sitesSuffix}`,
    `      ${dim(detail, opts)}`,
  ];
  if (group.to) {
    const toArrow = opts.unicode ? "→" : "->";
    const toText = count > 1 ? `replace with ${group.to}  ·  one fix clears all ${count} findings.` : `replace with ${group.to}`;
    lines.push(`      ${teal(toArrow, opts)} ${dim(toText, opts)}`);
  }
  if (group.migrationScale) {
    const warnGlyph = opts.unicode ? "⚠" : "!";
    lines.push(`      ${warnColor(`${warnGlyph} migration-scale (${group.fileCount} files) — sample before you sweep`, opts)}`);
  }
  lines.push("");
  return lines;
}

/** `--verbose` / explicit `--limit` — today's flat per-finding list, byte-identical. */
function flatTopFindings(findings: Finding[], opts: TerminalOpts): string[] {
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

/** Default mode — fix-grouped view (design §2): up to 5 group blocks, ranked per `rankedGroups`. */
function groupedTopFindings(findings: Finding[], opts: TerminalOpts, projection: ProjectionMeta | undefined): string[] {
  const groups = rankedGroups(findings, projection, opts);
  const shown = groups.slice(0, 5);
  const lines: string[] = ["", bold("  Top findings", opts), ""];
  shown.forEach((g, i) => lines.push(...groupLines(g, i + 1, opts)));
  const remaining = groups.length - shown.length;
  if (remaining > 0) {
    const moreMsg = opts.outDir
      ? `${remaining} more groups  ·  full list in ${opts.outDir}/lyse.json`
      : `${remaining} more groups  ·  use --output <dir> for the full JSON report`;
    lines.push(`     ${dim(moreMsg, opts)}`);
    lines.push("");
  }
  return lines;
}

function topFindings(findings: Finding[], opts: TerminalOpts, projection: ProjectionMeta | undefined): string[] {
  if (findings.length === 0) return [];
  // Verbose and an explicit --limit are deep-dive / machine-ish reads — keep
  // the flat per-finding list. Default mode gets the new grouped-by-fix view.
  if (opts.findingsLimit !== undefined || opts.mode === "verbose") {
    return flatTopFindings(findings, opts);
  }
  return groupedTopFindings(findings, opts, projection);
}

function nextSteps(result: AuditResult, opts: TerminalOpts): string[] {
  const tips: string[] = [];
  const axisBy = new Map(result.axes.map((a) => [a.axis, a]));
  const tokens = axisBy.get("tokens");
  const components = axisBy.get("components");
  const stories = axisBy.get("stories");
  const a11y = axisBy.get("a11y");
  const aiSurface = axisBy.get("ai-surface");

  if (tokens !== undefined && tokens.score !== "N/A" && tokens.score < 70) {
    tips.push(`Run \`lyse handoff\`  ${dim("·", opts)}  hand these findings to your coding agent to fix`);
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
  if (aiSurface !== undefined && aiSurface.score !== "N/A" && aiSurface.score < 70) {
    tips.push(`Run \`lyse init --scaffold\`  ${dim("·", opts)}  generate the AI-readiness files your DS is missing`);
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

  lines.push(...renderScoreCard(result, opts, deltaSuffix));

  // Layer 4 banners — shown immediately after the card block. In v0.1.0
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
    lines.push(`  ${dim("No token registry detected — run `lyse init` for a calibrated score.", opts)}`);
  }

  if (opts.mode !== "quiet") {
    lines.push(...topFindings(result.findings, opts, result.meta?.projection));
    lines.push(...nextSteps(result, opts));
  }
  if (result.meta?.coverage) {
    lines.push("", `  ${dim(formatCoverageFooter(result.meta.coverage), opts)}`);
  }
  lines.push(footer(result, opts));
  return lines.join("\n");
}
