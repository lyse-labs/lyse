import { createLyseRule } from "./_rule-module.js";
import type { Finding, RuleContext, ParsedFiles, RuleEvalResult, Rule } from "../types.js";
import type { AxeViolation } from "../render/axe-runner.js";

const RULE_ID = "a11y/runtime-axe";

function impactToSeverity(impact: string): "error" | "warning" {
  return impact === "critical" || impact === "serious" ? "error" : "warning";
}

export function detectAxeFindings(violations: AxeViolation[]): Finding[] {
  return violations.map((v) => ({
    ruleId: RULE_ID,
    axis: "a11y" as const,
    severity: impactToSeverity(v.impact),
    location: { file: "<rendered>", line: 1, column: 1 },
    message: `axe-core ${v.ruleId} (${v.impact}): ${v.help} — ${v.nodes} node(s).`,
  }));
}

const evaluate = async (ctx: RuleContext, _files: ParsedFiles): Promise<RuleEvalResult> => {
  if (!ctx.axeViolations) return { findings: [], opportunities: 0 };
  const probed = ctx.axeStoriesProbed ?? 0;
  if (probed === 0) return { findings: [], opportunities: 0 };
  return { findings: detectAxeFindings(ctx.axeViolations), opportunities: probed };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "a11y",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Rendered components pass automated axe-core accessibility checks",
    fullDescription:
      "Runs axe-core against a design system's real rendered components, sourced from a pre-built Storybook (`storybook-static/` or a running URL), under `lyse audit --render`. Emits one finding per axe violation (severity from axe impact: critical/serious → error, moderate/minor → warning). N/A when no Storybook is found or `--render` is not set. Covers axe-core's automatable subset (~30% of WCAG criteria) — it complements, never replaces, manual audits.",
    helpUri: "https://github.com/lyse-labs/lyse/blob/main/docs/rules/a11y-runtime-axe.md",
    rationale:
      "Many a11y defects (color contrast, missing alt text, ARIA misuse) only exist in the rendered DOM and are invisible to static analysis. Running axe-core on the design system's own Storybook stories catches them against the exact markup the DS ships.",
    examples: [
      {
        good: '<img src="logo.png" alt="Acme logo">',
        bad: '<img src="logo.png">',
      },
    ],
    allowlist: [
      "design systems without a pre-built Storybook — the rule is N/A",
      "runs only under `lyse audit --render`; the default audit never invokes it",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});
