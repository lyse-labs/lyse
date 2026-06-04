import type { Rule, RuleContext, ParsedFiles, Finding, AxisName, ParseError } from "./types.js";

export interface RunRulesResult {
  findings: Finding[];
  opportunitiesByAxis: Record<AxisName, number>;
  findingsByAxis: Record<AxisName, number>;
  parseErrors: ParseError[];
}

const ZERO: Record<AxisName, number> = { tokens: 0, a11y: 0, components: 0, stories: 0, "ai-surface": 0 };

export async function runRules(rules: Rule[], ctx: RuleContext, parsed: ParsedFiles): Promise<RunRulesResult> {
  const findings: Finding[] = [];
  const opportunitiesByAxis: Record<AxisName, number> = { ...ZERO };
  const findingsByAxis: Record<AxisName, number> = { ...ZERO };
  const parseErrors: ParseError[] = [];

  for (const rule of rules) {
    const r = await rule.evaluate(ctx, parsed);
    findings.push(...r.findings);
    opportunitiesByAxis[rule.axis] += r.opportunities;
    findingsByAxis[rule.axis] += r.findings.length;
    if (r.parseErrors) parseErrors.push(...r.parseErrors);
  }

  findings.sort((a, b) => {
    const order = { error: 0, warning: 1, info: 2 } as const;
    return order[a.severity] - order[b.severity];
  });

  parseErrors.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));

  return { findings, opportunitiesByAxis, findingsByAxis, parseErrors };
}
