import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding, TokenMap } from "../types.js";
import { createLyseRule } from "./_rule-module.js";
import { isInCommentOrUrl, isCssCustomPropertyDeclaration } from "./_skip-context.js";

const RULE_ID = "tokens/no-hardcoded-shadow";
const MAX_FILE_BYTES = 1_000_000;
const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;
const README_CANDIDATES = ["README.md", "README", "readme.md", "README.mdx"];

const RE_BOX_SHADOW = /\bbox-shadow\s*:\s*([^;}{]+)/gi;
// Values that are not drift: keywords + tokenized references.
const RE_NOOP = /^(?:none|unset|initial|inherit|revert)$/i;

const norm = (s: string): string => s.replace(/\s+/g, "").toLowerCase();

export interface ShadowHit {
  raw: string;
  index: number;
}

function extractShadows(text: string): ShadowHit[] {
  const hits: ShadowHit[] = [];
  RE_BOX_SHADOW.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_BOX_SHADOW.exec(text)) !== null) {
    const value = m[1]!.trim();
    if (RE_NOOP.test(value) || /var\(/i.test(value)) continue;
    const index = m.index + m[0]!.indexOf(m[1]!);
    if (isInCommentOrUrl(text, index) || isCssCustomPropertyDeclaration(text, index)) continue;
    hits.push({ raw: value, index });
  }
  return hits;
}

function shadowScaleSet(tokens: TokenMap | null): Set<string> {
  const set = new Set<string>();
  const scale = tokens?.shadows;
  if (scale) for (const key of scale.keys()) set.add(norm(key));
  return set;
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
  const scale = shadowScaleSet(ctx.tokens);
  let opportunities = 0;
  const sources = [
    ...files.css.filter((f) => !f.skipped).map((f) => ({ path: f.path, source: f.source })),
    ...files.cssInJs.map((b) => ({ path: b.path, source: b.content })),
  ];
  for (const { path, source } of sources) {
    for (const hit of extractShadows(source)) {
      opportunities++;
      if (scale.has(norm(hit.raw))) continue;
      findings.push({
        ruleId: RULE_ID,
        axis: "tokens",
        severity: "warning",
        location: { file: path, line: lineFromIndex(source, hit.index), column: 1 },
        message: `Hardcoded box-shadow \`${hit.raw}\` — elevation should come from a shadow token scale`,
        suggestion: "reference a shadow token (e.g. `--shadow-sm`, `--elevation-2`) instead of a raw box-shadow",
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
    shortDescription: "Elevation should come from a shadow token scale",
    fullDescription:
      "Flags hardcoded `box-shadow` values in CSS / CSS-in-JS that aren't drawn from a shadow token scale. Keyword values (`none`, `inherit`, …) and tokenized references (`var(--shadow-*)`) are exempt. When a shadow token scale is loaded (`ctx.tokens.shadows`), values matching a token (whitespace-insensitive) are compliant; everything else is flagged. The full declaration value is treated as one unit (a shadow is a composite token, not per-length drift).",
    helpUri: "https://github.com/lyse-labs/lyse/blob/main/docs/rules/tokens-no-hardcoded-shadow.md",
    rationale: `Why it matters

Elevation is a system-level language: a handful of named shadows (\`--shadow-sm/md/lg\`) communicate depth consistently. Hand-rolled \`box-shadow\` values per component drift into a dozen near-identical-but-not blurs and opacities. Value-drift rule: experimental, does not contribute to the score until calibrated.`,
    examples: [
      { good: ":root { --shadow-sm: 0 1px 3px rgba(0,0,0,0.1); }\n.card { box-shadow: var(--shadow-sm); }", bad: ".card { box-shadow: 0 2px 8px rgba(0,0,0,0.2); }" },
    ],
    allowlist: [
      "repos containing `lyse-disable tokens/no-hardcoded-shadow` in a README — rule is N/A",
      "`none` / keyword values — never flagged",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = { extractShadows, shadowScaleSet, isAllowlisted, DISABLE_DIRECTIVE };
