import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding } from "../types.js";
import { createLyseRule } from "./_rule-module.js";
import { isInCommentOrUrl, isCssCustomPropertyDeclaration } from "./_skip-context.js";

const RULE_ID = "tokens/no-hardcoded-gradient";
const MAX_FILE_BYTES = 1_000_000;
const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;
const README_CANDIDATES = ["README.md", "README", "readme.md", "README.mdx"];

// A CSS gradient function used as a value. A gradient is a composite design
// decision (brand sheen, scrim, …) that belongs in a token, not inline.
const RE_GRADIENT = /\b(?:repeating-)?(?:linear|radial|conic)-gradient\s*\(/gi;

export interface GradientHit {
  raw: string;
  index: number;
}

export function extractGradients(text: string): GradientHit[] {
  const hits: GradientHit[] = [];
  RE_GRADIENT.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_GRADIENT.exec(text)) !== null) {
    const index = m.index;
    // A gradient defined ON a custom property (`--gradient-x: linear-gradient(…)`)
    // is the token definition — the good case. Comments/URLs are not drift.
    if (isInCommentOrUrl(text, index) || isCssCustomPropertyDeclaration(text, index)) continue;
    hits.push({ raw: m[0]!.replace(/\s*\($/, ""), index });
  }
  return hits;
}

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

const evaluate = async (ctx: RuleContext, files: ParsedFiles): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (ctx.repoRoot && isAllowlisted(ctx.repoRoot)) return { findings, opportunities: 0 };
  let opportunities = 0;
  const sources = [
    ...files.css.filter((f) => !f.skipped).map((f) => ({ path: f.path, source: f.source, blockLine: 0 })),
    ...files.cssInJs.map((b) => ({ path: b.path, source: b.content, blockLine: b.line })),
  ];
  for (const { path, source, blockLine } of sources) {
    for (const hit of extractGradients(source)) {
      opportunities++;
      const line = blockLine > 0 ? blockLine : lineFromIndex(source, hit.index);
      findings.push({
        ruleId: RULE_ID,
        axis: "tokens",
        severity: "warning",
        location: { file: path, line, column: 1 },
        message: `Hardcoded \`${hit.raw}()\` — gradients should come from a token, not inline literals`,
        suggestion: "define the gradient as a token (CSS custom property `--gradient-*`, or a DTCG/theme entry) and reference it via `var(--gradient-*)`",
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
    shortDescription: "Gradients should come from a token, not inline literals",
    fullDescription:
      "Flags inline CSS gradient functions (`linear-gradient`, `radial-gradient`, `conic-gradient`, and their `repeating-` variants) used as property values in CSS / CSS-in-JS. A gradient defined ON a CSS custom property (`--gradient-brand: linear-gradient(…)`) is the token definition and is exempt, as are gradients referenced via `var(--gradient-*)` (no literal present), comments, and URLs. The gradient is treated as one unit — a composite design token, not per-color drift (raw colors inside are the `tokens/no-hardcoded-color` rule's concern).",
    helpUri: "https://github.com/lyse-labs/lyse/blob/main/docs/rules/tokens-no-hardcoded-gradient.md",
    rationale: `Why it matters

A brand gradient is a system decision — a named token (\`--gradient-brand\`, \`--gradient-scrim\`) keeps it consistent and themeable. Inline \`linear-gradient(...)\` literals scattered across components drift into a dozen near-identical-but-not sheens and can't be re-themed in one place. The good case is to define the gradient once as a custom property and reference it. Value-drift rule: experimental, does not contribute to the score until calibrated.`,
    examples: [
      { good: ":root { --gradient-brand: linear-gradient(90deg, #f00, #00f); }\n.hero { background: var(--gradient-brand); }", bad: ".hero { background: linear-gradient(90deg, #f00, #00f); }" },
    ],
    allowlist: [
      "repos containing `lyse-disable tokens/no-hardcoded-gradient` in a README — rule is N/A",
      "gradients defined on a `--custom-property` (the token definition) — never flagged",
      "`var(--gradient-*)` references — no inline literal, so never flagged",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = { extractGradients, isAllowlisted, DISABLE_DIRECTIVE };
