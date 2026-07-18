import { readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import fg from "fast-glob";
import type {
  Rule,
  RuleContext,
  ParsedFiles,
  RuleEvalResult,
  Finding,
} from "../types.js";
import { isPathExcluded } from "./_exclude.js";
import { createLyseRule } from "./_rule-module.js";
import {
  isDtcgGroup,
  isDtcgToken,
  type DtcgDocument,
  type DtcgToken,
} from "../tokens/dtcg-model.js";

const MAX_FILE_BYTES = 1_000_000;
const RULE_ID = "tokens/description-coverage";
const COVERAGE_THRESHOLD = 0.8; // 80 %

const SEMANTIC_PATH_SEGMENTS = new Set<string>([
  "action",
  "surface",
  "text",
  "background",
  "border",
  "feedback",
  "state",
  "interactive",
  "link",
  "semantic",
]);

function discoverDtcgFiles(ctx: RuleContext): string[] {
  if (!ctx.repoRoot) return [];
  let entries: string[] = [];
  try {
    entries = fg.sync(["**/*.tokens.json", "tokens/**/*.json", "**/tokens/**/*.json"], {
      cwd: ctx.repoRoot,
      absolute: false,
      dot: false,
      ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**"],
      followSymbolicLinks: false,
    });
  } catch {
    return [];
  }
  const out = new Set<string>();
  for (const rel of entries) {
    if (isPathExcluded(rel, ctx.excludePaths)) continue;
    out.add(rel);
  }
  return Array.from(out).sort();
}

function readJsonIfSmall(absPath: string): unknown | null {
  try {
    const stat = statSync(absPath);
    if (!stat.isFile()) return null;
    if (stat.size > MAX_FILE_BYTES) return null;
    const raw = readFileSync(absPath, "utf8");
    if (raw.trim().length === 0) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function hasAnyValueKey(node: unknown, depthBudget: number): boolean {
  if (depthBudget < 0) return false;
  if (typeof node !== "object" || node === null || Array.isArray(node)) return false;
  for (const [k, v] of Object.entries(node)) {
    if (k === "$value") return true;
    if (typeof v === "object" && v !== null && hasAnyValueKey(v, depthBudget - 1)) return true;
  }
  return false;
}

function looksLikeDtcg(data: unknown): boolean {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return false;
  return hasAnyValueKey(data, 4);
}

function isSemanticTokenPath(path: string[]): boolean {
  if (path.length === 0) return false;
  // A path is semantic if any segment matches a known semantic prefix.
  for (const seg of path) {
    if (SEMANTIC_PATH_SEGMENTS.has(seg)) return true;
  }
  // brand.semantic.* — the "semantic" segment already matches above. Top-level
  // primitives like color.blue.500 / spacing.16 / radius.md are intentionally
  // excluded because none of their segments are in the semantic set.
  return false;
}

interface CoverageStats {
  semanticCount: number;
  semanticWithDescription: number;
}

function walkForCoverage(doc: DtcgDocument): CoverageStats {
  const stats: CoverageStats = { semanticCount: 0, semanticWithDescription: 0 };
  const visit = (node: unknown, path: string[]) => {
    if (typeof node !== "object" || node === null || Array.isArray(node)) return;
    if (isDtcgToken(node)) {
      if (isSemanticTokenPath(path)) {
        stats.semanticCount++;
        const desc = (node as DtcgToken<unknown>).$description;
        if (typeof desc === "string" && desc.trim().length > 0) {
          stats.semanticWithDescription++;
        }
      }
      return;
    }
    if (!isDtcgGroup(node)) return;
    for (const [k, v] of Object.entries(node)) {
      if (k.startsWith("$")) continue;
      visit(v, [...path, k]);
    }
  };
  visit(doc, []);
  return stats;
}

const evaluate = async (
  ctx: RuleContext,
  _files: ParsedFiles,
): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  const relFiles = discoverDtcgFiles(ctx);
  if (relFiles.length === 0) {
    return { findings, opportunities: 0 };
  }

  let totalSemantic = 0;
  let totalDescribed = 0;
  let primaryFile: string | null = null;

  for (const rel of relFiles) {
    const abs = isAbsolute(rel) ? rel : join(ctx.repoRoot, rel);
    const data = readJsonIfSmall(abs);
    if (data === null) continue;
    if (!looksLikeDtcg(data)) continue;
    if (primaryFile === null) primaryFile = relative(ctx.repoRoot, abs) || rel;
    const stats = walkForCoverage(data as DtcgDocument);
    totalSemantic += stats.semanticCount;
    totalDescribed += stats.semanticWithDescription;
  }

  // No semantic tokens found — N/A
  if (totalSemantic === 0) {
    return { findings, opportunities: 0 };
  }

  const coverage = totalDescribed / totalSemantic;
  if (coverage < COVERAGE_THRESHOLD) {
    const pct = (coverage * 100).toFixed(coverage * 100 < 1 ? 0 : 1).replace(/\.0$/, "");
    findings.push({
      ruleId: RULE_ID,
      axis: "tokens",
      severity: "info",
      location: { file: primaryFile ?? "lyse.tokens.json", line: 1, column: 1 },
      message: `Semantic-layer $description coverage is ${pct}% (${totalDescribed}/${totalSemantic}); target is 80%`,
      suggestion: "add $description to semantic tokens (action.*, surface.*, text.*, feedback.*, etc.)",
    });
  }

  return { findings, opportunities: totalSemantic };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "tokens",
    lyseRuleId: RULE_ID,
    defaultSeverity: "info",
    shortDescription: "Semantic tokens should declare a $description",
    fullDescription:
      "Measures the fraction of semantic-layer tokens (`action.*`, `surface.*`, `text.*`, `background.*`, `border.*`, `feedback.*`, `state.*`, `interactive.*`, `link.*`, or any token under a `semantic` group) that declare a non-empty `$description`. Emits a single summary finding when coverage falls below 80%.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/tokens-description-coverage.md",
    rationale: `Why it matters

Semantic tokens are the contract surface between design and code. Their primitive counterparts (\`color.blue.500\`, \`spacing.16\`) are self-explanatory — a number or a hex. But \`action.primary\` only makes sense if the token explains *what* it's for: "the default action color for primary buttons, brand surfaces, and emphasized text".

Undocumented semantic tokens cause AI agents and humans alike to pick the wrong token. \`$description\` is the cheapest documentation surface in a DS — and the one most often skipped.

The rule is intentionally informational (severity: info) and computes coverage on the semantic layer only. Primitive tokens are excluded from the denominator.`,
    examples: [
      {
        good: '{ "action": { "primary": { "$value": "{color.brand.500}", "$type": "color", "$description": "Default action color for primary CTAs and emphasized text" } } }',
        bad: '{ "action": { "primary": { "$value": "{color.brand.500}", "$type": "color" } } }',
      },
    ],
    allowlist: [
      "primitive tokens — `color.blue.500`, `spacing.16`, `radius.md` — excluded from the denominator",
      "repos with no DTCG file — rule is N/A (opportunities = 0)",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  walkForCoverage,
  isSemanticTokenPath,
  COVERAGE_THRESHOLD,
};
