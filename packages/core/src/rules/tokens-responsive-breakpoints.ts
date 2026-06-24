import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding } from "../types.js";
import { createLyseRule } from "./_rule-module.js";

const RULE_ID = "tokens/responsive-breakpoints";
const MAX_FILE_BYTES = 1_000_000;

const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;
const README_CANDIDATES = ["README.md", "README", "readme.md", "README.mdx"];

// A width-based media query — the signal that a stylesheet is responsive.
// Matches `@media (min-width:`, `(max-width:`, `(width:`, and range syntax
// `(width <= 600px)` / `(400px <= width)`.
const RE_WIDTH_MEDIA = /@media[^{};]*(?:\b(?:min-width|max-width|width)\s*[:<>]|\b\d[\d.]*(?:px|r?em)\s*[<>])/i;
// SCSS / CSS-custom-property breakpoint variables: `$breakpoint`, `$bp-md`,
// `$screen-lg`, `--breakpoint-md`, `--bp-sm`.
const RE_BP_VAR = /(?:\$|--)(?:bp|breakpoint|screen)s?\b/i;
// A JS/TS breakpoints scale: `breakpoints: { ... }` / `breakpoints = { ... }` /
// `screens: { ... }` (Tailwind config).
const RE_BP_OBJECT = /\b(?:breakpoints|screens)\b\s*[:=]/;

function usesWidthMediaQuery(src: string): boolean {
  return RE_WIDTH_MEDIA.test(src);
}

function hasBreakpointVar(src: string): boolean {
  return RE_BP_VAR.test(src);
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

  const responsive =
    files.css.some((f) => !f.skipped && usesWidthMediaQuery(f.source)) ||
    files.cssInJs.some((b) => usesWidthMediaQuery(b.content));

  if (!responsive) return { findings, opportunities: 0 };

  // A breakpoint scale can come from the loaded token map (Tailwind screens,
  // DTCG dimension tokens, CSS vars) or from a textual signal in the sources
  // (SCSS/CSS breakpoint variables, or a JS/TS `breakpoints` / `screens` object).
  const hasScale =
    (ctx.tokens?.breakpoints?.size ?? 0) > 0 ||
    files.css.some((f) => !f.skipped && hasBreakpointVar(f.source)) ||
    files.cssInJs.some((b) => hasBreakpointVar(b.content)) ||
    files.ts.some((f) => hasBreakpointVar(f.source) || RE_BP_OBJECT.test(f.source));

  if (hasScale) return { findings, opportunities: 1 };

  findings.push({
    ruleId: RULE_ID,
    axis: "tokens",
    severity: "warning",
    location: { file: ".", line: 1, column: 1 },
    message:
      "Design system uses responsive media queries but defines no tokenized breakpoint scale — breakpoints are ad-hoc and drift across components",
    suggestion:
      "define a breakpoint scale (Tailwind `screens`, DTCG dimension tokens, SCSS `$breakpoint-*` variables, or a JS `breakpoints` theme object) and reference it from media queries",
  });
  return { findings, opportunities: 1 };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "tokens",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Responsive design systems should tokenize their breakpoints",
    fullDescription:
      "Checks, at repo level, whether a design system that uses width-based `@media` queries (in CSS, SCSS, or CSS-in-JS) also defines a tokenized breakpoint scale — loaded breakpoint tokens (Tailwind `screens`, DTCG, CSS vars), SCSS / CSS breakpoint variables (`$breakpoint-*`, `--bp-*`), or a JS/TS `breakpoints` / `screens` object. Emits one warning when the system is responsive but no breakpoint scale is found anywhere; emits nothing when a scale exists or when there are no width media queries (N/A). The per-occurrence detection of hardcoded media-query values overlaps the hardcoded-value rule family and is intentionally not done here.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/tokens-responsive-breakpoints.md",
    rationale: `Why it matters

When breakpoints live as bare literals scattered across stylesheets (\`600px\` here, \`640px\` there, \`768px\` elsewhere), the design system has no single source of truth for its responsive grid. Layouts break at inconsistent widths and consumers can't reason about the system's breakpoints. A tokenized scale — however expressed — makes the breakpoints explicit and shared.

The check is repo-level and broad: any breakpoint-scale signal anywhere clears it.`,
    examples: [
      {
        good: "$breakpoint-md: 768px;\n@media (min-width: $breakpoint-md) { .grid { … } }",
        bad: "@media (min-width: 768px) { .grid { … } }  /* no breakpoint scale anywhere */",
      },
    ],
    allowlist: [
      "repos containing `lyse-disable tokens/responsive-breakpoints` in a README — rule is N/A",
      "design systems that use no width media queries — the check does not apply (N/A)",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  usesWidthMediaQuery,
  hasBreakpointVar,
  isAllowlisted,
  DISABLE_DIRECTIVE,
};
