import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding } from "../types.js";
import { createLyseRule } from "./_rule-module.js";

const RULE_ID = "tokens/css-custom-property-export";
const MAX_FILE_BYTES = 1_000_000;

const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;
const README_CANDIDATES = ["README.md", "README", "readme.md", "README.mdx"];

// A CSS custom-property DEFINITION (`--name: value`), not a consumption
// (`var(--name)`). The leading boundary avoids matching inside `var(--x)`.
const RE_CUSTOM_PROP_DEF = /(?:^|[\s;{])--[\w-]+\s*:/;
// Tailwind v4 exports its whole theme as real CSS custom properties (`--color-*`,
// `--spacing-*`, …). Either an explicit `@theme { … }` block OR adopting Tailwind
// v4 via `@import "tailwindcss"` means the theme IS exported through the framework.
const RE_THEME_BLOCK = /@theme\b|@import\s+["']tailwindcss["']/;
// A styling declaration — the signal that this CSS actually paints something
// (a `prop: value;` pair inside a rule). Used to decide applicability (N/A).
const RE_DECLARATION = /[\w-]+\s*:\s*[^;{}]+;/;

// Strip CSS block comments so a custom property mentioned only in a comment
// does not count as a real export.
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ");
}

export function definesCustomProperty(src: string): boolean {
  const clean = stripComments(src);
  return RE_CUSTOM_PROP_DEF.test(clean) || RE_THEME_BLOCK.test(clean);
}

function hasStyling(src: string): boolean {
  return RE_DECLARATION.test(stripComments(src));
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

  const sources = [
    ...files.css.filter((f) => !f.skipped).map((f) => f.source),
    ...files.cssInJs.map((b) => b.content),
  ];

  // Applicability: only design systems that actually paint CSS are in scope.
  const paintsCss = sources.some((s) => hasStyling(s));
  if (!paintsCss) return { findings, opportunities: 0 };

  const exportsVars = sources.some((s) => definesCustomProperty(s));
  if (exportsVars) return { findings, opportunities: 1 };

  findings.push({
    ruleId: RULE_ID,
    axis: "tokens",
    severity: "warning",
    location: { file: ".", line: 1, column: 1 },
    message:
      "Design system styles in CSS but exports no CSS custom properties — its theme values are not consumable or re-themeable as CSS variables",
    suggestion:
      "expose theme tokens as CSS custom properties (`:root { --color-primary: … }`, a `[data-theme]` block, or a Tailwind v4 `@theme` block) so consumers can read and override them",
  });
  return { findings, opportunities: 1 };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "tokens",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Design systems should export theme tokens as CSS custom properties",
    fullDescription:
      "Checks, at repo level, whether a design system that paints CSS (any styling declaration in CSS / SCSS / extracted CSS-in-JS) also exports at least one CSS custom-property definition (`--name: value` in `:root`, a `[data-theme]` block, `html`, a `.theme-*` selector, or a Tailwind v4 `@theme` block). Consuming a variable (`var(--x)`) does not count — only a definition does. Emits one warning when the system styles in CSS but defines no custom property anywhere; emits nothing when at least one definition exists or when the system ships no CSS (N/A). A custom property mentioned only inside a comment does not count.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/tokens-css-custom-property-export.md",
    rationale: `Why it matters

CSS custom properties are the runtime-themeable surface of a design system: a consumer can read \`--color-primary\` and override it per brand, per mode, or per surface without rebuilding. A design system that locks its tokens in Sass variables or JS objects only — styling everything with literals — can't be re-themed at runtime and gives downstream products nothing to hook into.

The check is repo-level and broad: a single custom-property definition (or a Tailwind \`@theme\` block) anywhere clears it.`,
    examples: [
      {
        good: ":root { --color-primary: #3b82f6; }\n.btn { color: var(--color-primary); }",
        bad: ".btn { color: #3b82f6; background: #1e293b; }  /* no custom properties exported */",
      },
    ],
    allowlist: [
      "repos containing `lyse-disable tokens/css-custom-property-export` in a README — rule is N/A",
      "design systems that ship no CSS at all — the check does not apply (N/A)",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  definesCustomProperty,
  hasStyling,
  isAllowlisted,
  DISABLE_DIRECTIVE,
};
