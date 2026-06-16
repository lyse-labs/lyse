import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding } from "../types.js";
import { createLyseRule } from "./_rule-module.js";

const RULE_ID = "tokens/no-hardcoded-border-width";
const MAX_FILE_BYTES = 1_000_000;
const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;
const README_CANDIDATES = ["README.md", "README", "readme.md", "README.mdx"];

// Longhand `border-width` / `border-<side>-width`.
const RE_BW_LONGHAND = /\bborder(?:-(?:top|right|bottom|left))?-width\s*:\s*([^;}{]+)/gi;
// Shorthand `border` / `border-<side>` (NOT border-radius/color/style — those
// don't have `:` immediately after the optional side).
const RE_BORDER_SHORTHAND = /\bborder(?:-(?:top|right|bottom|left))?\s*:\s*([^;}{]+)/gi;
const RE_LENGTH = /(-?\d*\.?\d+)(px|rem|em)\b/i;

function readFileIfSmall(absPath: string): string | null {
  try {
    const stat = statSync(absPath);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
    return readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
}
function isAllowlisted(repoRoot: string): boolean {
  for (const c of README_CANDIDATES) {
    const abs = join(repoRoot, c);
    if (!existsSync(abs)) continue;
    const content = readFileIfSmall(abs);
    if (content !== null && content.includes(DISABLE_DIRECTIVE)) return true;
  }
  return false;
}
function lineFromIndex(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

// A width literal is exempt when it's 0 or the ubiquitous 1px hairline.
function isExemptWidth(raw: string): boolean {
  const m = RE_LENGTH.exec(raw);
  if (!m) return true;
  const n = Number.parseFloat(m[1]!);
  return n === 0 || (n === 1 && m[2]!.toLowerCase() === "px");
}

interface Hit { raw: string; index: number; }
function extractBorderWidths(text: string): Hit[] {
  const hits: Hit[] = [];
  for (const re of [RE_BW_LONGHAND, RE_BORDER_SHORTHAND]) {
    re.lastIndex = 0;
    let d: RegExpExecArray | null;
    while ((d = re.exec(text)) !== null) {
      const value = d[1]!;
      if (/var\(/i.test(value)) continue;
      const lm = RE_LENGTH.exec(value);
      if (!lm) continue; // keyword (thin/medium/thick) or no length
      if (isExemptWidth(lm[0]!)) continue;
      hits.push({ raw: lm[0]!, index: d.index + d[0]!.indexOf(value) + lm.index });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

const evaluate = async (ctx: RuleContext, files: ParsedFiles): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (ctx.repoRoot && isAllowlisted(ctx.repoRoot)) return { findings, opportunities: 0 };
  const scale = ctx.tokens?.borderWidth ?? null;
  let opportunities = 0;
  const sources = [
    ...files.css.filter((f) => !f.skipped).map((f) => ({ path: f.path, source: f.source })),
    ...files.cssInJs.map((b) => ({ path: b.path, source: b.content })),
  ];
  for (const { path, source } of sources) {
    for (const hit of extractBorderWidths(source)) {
      opportunities++;
      if (scale !== null && scale.has(hit.raw)) continue;
      findings.push({
        ruleId: RULE_ID,
        axis: "tokens",
        severity: "warning",
        location: { file: path, line: lineFromIndex(source, hit.index), column: 1 },
        message: `Hardcoded border-width \`${hit.raw}\` — border thickness should come from a token scale`,
        suggestion: "reference a border-width token (e.g. `--border-width-thick`) instead of a raw length",
      });
    }
  }
  return { findings, opportunities };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "tokens",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Border thickness should come from a token scale",
    fullDescription:
      "Flags hardcoded border-width length literals (px/rem/em) in CSS / CSS-in-JS — both the `border-width` / `border-<side>-width` longhands and the first length inside a `border` / `border-<side>` shorthand — that are not drawn from a border-width token scale. `0`, the ubiquitous `1px` hairline, and tokenized references (`var(--border-width-*)`) are exempt. When a border-width scale is loaded (`ctx.tokens.borderWidth`), on-scale values are compliant; off-scale values are flagged.",
    helpUri: "https://github.com/lyse-labs/lyse/blob/main/docs/rules/tokens-no-hardcoded-border-width.md",
    rationale: `Why it matters

Border thicknesses beyond the default hairline (\`2px\`, \`3px\`, \`0.5px\`) should be deliberate, named choices, not magic numbers sprinkled per component. A small border-width scale keeps emphasis borders consistent. Value-drift rule: experimental, does not contribute to the score until calibrated.`,
    examples: [
      { good: ":root { --border-width-thick: 2px; }\n.active { border: var(--border-width-thick) solid; }", bad: ".active { border: 3px solid; }" },
    ],
    allowlist: [
      "repos containing `lyse-disable tokens/no-hardcoded-border-width` in a README — rule is N/A",
      "`0` and the `1px` hairline — never flagged",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = { extractBorderWidths, isExemptWidth, isAllowlisted, DISABLE_DIRECTIVE };
