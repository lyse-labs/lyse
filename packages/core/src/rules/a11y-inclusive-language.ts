import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding } from "../types.js";
import { createLyseRule } from "./_rule-module.js";

const RULE_ID = "a11y/inclusive-language";
const MAX_FILE_BYTES = 1_000_000;

const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;
const README_CANDIDATES = ["README.md", "README", "readme.md", "README.mdx"];

// High-confidence, low-ambiguity terms only. `master` / `dummy` are
// deliberately excluded — they produce too many false positives ("master
// branch", "masterclass", "dummy data") to be worth flagging at this precision.
interface TermRule {
  re: RegExp;
  suggestion: string;
}
const TERM_RULES: TermRule[] = [
  { re: /\bwhite[\s_-]?list(ed|ing|s)?\b/gi, suggestion: "allowlist" },
  { re: /\bblack[\s_-]?list(ed|ing|s)?\b/gi, suggestion: "denylist / blocklist" },
  { re: /\bsanity[\s_-]?check(ed|ing|s)?\b/gi, suggestion: "quick check / confidence check" },
  { re: /\bgrandfather(ed|ing|s)?\b/gi, suggestion: "legacy / exempt" },
  { re: /\bslaves?\b/gi, suggestion: "replica / secondary / worker" },
];

export interface TermHit {
  term: string;
  index: number;
  suggestion: string;
}

function findTerms(text: string): TermHit[] {
  const hits: TermHit[] = [];
  for (const { re, suggestion } of TERM_RULES) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      hits.push({ term: m[0], index: m.index, suggestion });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
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

  const sources: { path: string; source: string }[] = [
    ...files.ts.map((f) => ({ path: f.path, source: f.source })),
    ...files.css.filter((f) => !f.skipped).map((f) => ({ path: f.path, source: f.source })),
    ...files.cssInJs.map((b) => ({ path: b.path, source: b.content })),
  ];

  for (const { path, source } of sources) {
    for (const hit of findTerms(source)) {
      findings.push({
        ruleId: RULE_ID,
        axis: "a11y",
        severity: "info",
        location: { file: path, line: lineFromIndex(source, hit.index), column: 1 },
        message: `Non-inclusive term "${hit.term}" — prefer ${hit.suggestion}`,
        suggestion: `replace "${hit.term}" with ${hit.suggestion}`,
      });
    }
  }

  return { findings, opportunities: findings.length };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "a11y",
    lyseRuleId: RULE_ID,
    defaultSeverity: "info",
    shortDescription: "Prefer inclusive terminology in code and docs",
    fullDescription:
      "Flags a small, high-confidence set of non-inclusive terms in TS/JS, CSS, and CSS-in-JS sources — `whitelist` (→ allowlist), `blacklist` (→ denylist), `sanity check` (→ quick check), `grandfathered` (→ legacy/exempt), and `slave` (→ replica/secondary). Each match is one `info` finding with a suggested replacement. Ambiguous terms (`master`, `dummy`) are deliberately NOT flagged to keep precision high. The block is repo-disablable via a README directive.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/a11y-inclusive-language.md",
    rationale: `Why it matters

A design system's vocabulary propagates into every product and every developer who consumes it. Terms like \`whitelist\`/\`blacklist\` and \`master\`/\`slave\` carry exclusionary connotations and have established, clearer replacements (\`allowlist\`/\`denylist\`, \`primary\`/\`replica\`). Fixing them in the source of truth fixes them everywhere downstream.

The blocklist is intentionally narrow and unambiguous to avoid false positives.`,
    examples: [
      {
        good: "const allowlist: string[] = [];\nconst denylist: string[] = [];",
        bad: "const whitelist: string[] = [];\nconst blacklist: string[] = [];",
      },
    ],
    allowlist: [
      "repos containing `lyse-disable a11y/inclusive-language` in a README — rule is N/A",
      "`master` / `dummy` are never flagged (excluded to avoid false positives)",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  findTerms,
  isAllowlisted,
  DISABLE_DIRECTIVE,
};
