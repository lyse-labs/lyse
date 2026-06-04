import type {
  RuleContext,
  ParsedFiles,
  RuleEvalResult,
  Finding,
} from "../types.js";
import { createLyseRule } from "./_rule-module.js";

const evaluate = async (
  ctx: RuleContext,
  _files: ParsedFiles,
): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  // DS-self mode: DS repos may have stories in non-standard locations/formats
  // (Mantine's own format, Primer's *.docs.tsx, etc.). Skip to avoid false positives;
  // opportunities=0 means the axis reports N/A.
  // v0.2 will add DS-self-aware story analysis.
  if (ctx.dsSelfMode) return { findings, opportunities: 0 };
  if (!ctx.storyIndex) return { findings, opportunities: 0 };

  let opportunities = 0;
  for (const c of ctx.componentInventory) {
    opportunities++;
    if (!ctx.storyIndex.byTitle.has(c.name)) {
      findings.push({
        ruleId: "stories/coverage",
        axis: "stories",
        severity: "warning",
        location: { file: "(inventory)", line: 0, column: 0 },
        message: `DS component <${c.name}> used in ${c.usageCount} files has no Storybook story`,
        suggestion: `add a story file for ${c.name}`,
      });
    }
  }
  return { findings, opportunities };
};

export const rule = createLyseRule({
  meta: {
    axis: "stories",
    lyseRuleId: "stories/coverage",
    defaultSeverity: "warning",
    shortDescription: "DS components without Storybook stories",
    fullDescription:
      "DS components in the inventory (imported elsewhere in the codebase) that have no matching Storybook story are flagged. A DS component without a story is undocumented and untested for the team.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/storybook-coverage.md",
    rationale: `Why it matters

Storybook is the canonical documentation surface for a DS. Components without stories are invisible to designers, untestable visually, and an onboarding hazard for new engineers.

The rule scans \`storybook-static/index.json\` first (build output), falling back to filesystem scan of \`**/*.stories.{ts,tsx,js,jsx}\`. Coverage is computed per \`componentInventory\` entry — a DS component used N times in the codebase but with no story counts as one finding.`,
    examples: [
      { good: "Button.tsx + Button.stories.tsx", bad: "Button.tsx (no Button.stories.tsx)" },
    ],
    allowlist: ["components not in `componentInventory` (i.e., never imported)"],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});
