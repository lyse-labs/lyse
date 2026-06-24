import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding } from "../types.js";
import { createLyseRule } from "./_rule-module.js";
import { isInCommentOrUrl, isCssCustomPropertyDeclaration } from "./_skip-context.js";

const RULE_ID = "tokens/no-hardcoded-z-index";
const MAX_FILE_BYTES = 1_000_000;

const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;
const README_CANDIDATES = ["README.md", "README", "readme.md", "README.mdx"];

// `z-index: <int>` (also matches CSS-in-JS `zIndex: <int>` once the kebab/camel
// is normalized — the optional dash + case-insensitive flag covers both).
const RE_Z_INDEX = /\bz-?index\s*:\s*(-?\d+)\b/gi;
// Local stacking-context values that are not "z-index war" drift.
const TRIVIAL = new Set([-1, 0, 1]);

export interface ZIndexHit {
  value: number;
  index: number;
}

function extractZIndexValues(text: string): ZIndexHit[] {
  const hits: ZIndexHit[] = [];
  RE_Z_INDEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_Z_INDEX.exec(text)) !== null) {
    const value = Number.parseInt(m[1]!, 10);
    if (Number.isNaN(value) || TRIVIAL.has(value)) continue;
    if (isInCommentOrUrl(text, m.index) || isCssCustomPropertyDeclaration(text, m.index)) continue;
    hits.push({ value, index: m.index });
  }
  return hits;
}

function lineFromIndex(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
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
  for (const candidate of README_CANDIDATES) {
    const abs = join(repoRoot, candidate);
    if (!existsSync(abs)) continue;
    const content = readFileIfSmall(abs);
    if (content !== null && content.includes(DISABLE_DIRECTIVE)) return true;
  }
  return false;
}

const evaluate = async (ctx: RuleContext, files: ParsedFiles): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (ctx.repoRoot && isAllowlisted(ctx.repoRoot)) return { findings, opportunities: 0 };

  const scale = ctx.tokens?.zIndex ?? null;
  let opportunities = 0;

  const sources: { path: string; source: string }[] = [
    ...files.css.filter((f) => !f.skipped).map((f) => ({ path: f.path, source: f.source })),
    ...files.cssInJs.map((b) => ({ path: b.path, source: b.content })),
  ];

  for (const { path, source } of sources) {
    for (const hit of extractZIndexValues(source)) {
      opportunities++;
      // On-scale values are compliant (counted as opportunity, not flagged).
      if (scale !== null && scale.has(String(hit.value))) continue;
      findings.push({
        ruleId: RULE_ID,
        axis: "tokens",
        severity: "warning",
        location: { file: path, line: lineFromIndex(source, hit.index), column: 1 },
        message: `Hardcoded z-index \`${hit.value}\` — stacking order should come from a z-index token scale`,
        suggestion: "define a z-index scale (e.g. `--z-modal`, `--z-popover`) and reference it instead of a raw value",
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
    shortDescription: "Stacking order should come from a z-index token scale",
    fullDescription:
      "Flags hardcoded `z-index` integer literals in CSS and CSS-in-JS that are not drawn from a z-index token scale. Trivial local stacking values (`-1`, `0`, `1`) and tokenized references (`var(--z-*)`) are exempt. When a z-index token scale is loaded (`ctx.tokens.zIndex`), values on the scale are treated as compliant; off-scale values are flagged. This catches the classic 'z-index war' anti-pattern where arbitrary magic numbers (`9999`, `99999`) accrete across a codebase with no shared ordering.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/tokens-no-hardcoded-z-index.md",
    rationale: `Why it matters

Z-index without a shared scale is one of the most common sources of UI bugs in a design system: each component picks an arbitrary large number to "win", and overlays, dropdowns, tooltips and modals end up fighting unpredictably. A small, named z-index scale (\`--z-dropdown\`, \`--z-modal\`, \`--z-toast\`) makes stacking order an explicit, reviewable decision.

This is a value-drift rule, in the same family as the other hardcoded-value detectors.`,
    examples: [
      {
        good: ":root { --z-modal: 400; }\n.modal { z-index: var(--z-modal); }",
        bad: ".modal { z-index: 9999; }",
      },
    ],
    allowlist: [
      "repos containing `lyse-disable tokens/no-hardcoded-z-index` in a README — rule is N/A",
      "trivial local stacking values `-1`, `0`, `1` — never flagged",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  extractZIndexValues,
  isAllowlisted,
  DISABLE_DIRECTIVE,
};
