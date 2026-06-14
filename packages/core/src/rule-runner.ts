import type { Rule, RuleContext, ParsedFiles, Finding, AxisName, ParseError } from "./types.js";

export interface RunRulesResult {
  findings: Finding[];
  opportunitiesByAxis: Record<AxisName, number>;
  findingsByAxis: Record<AxisName, number>;
  parseErrors: ParseError[];
}

const ZERO: Record<AxisName, number> = { tokens: 0, a11y: 0, components: 0, stories: 0, "ai-surface": 0, "ai-governance": 0 };

export async function runRules(rules: Rule[], ctx: RuleContext, parsed: ParsedFiles): Promise<RunRulesResult> {
  const findings: Finding[] = [];
  const opportunitiesByAxis: Record<AxisName, number> = { ...ZERO };
  const findingsByAxis: Record<AxisName, number> = { ...ZERO };
  const parseErrors: ParseError[] = [];

  // Rules are stateless and receive read-only context, so they run concurrently.
  // Promise.all preserves input order → aggregation stays deterministic.
  const results = await Promise.all(rules.map((rule) => rule.evaluate(ctx, parsed)));
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]!;
    const r = results[i]!;
    findings.push(...r.findings);
    opportunitiesByAxis[rule.axis] += r.opportunities;
    findingsByAxis[rule.axis] += r.findings.length;
    if (r.parseErrors) parseErrors.push(...r.parseErrors);
  }

  // Fully deterministic order regardless of rule registration/scheduling.
  const order = { error: 0, warning: 1, info: 2 } as const;
  findings.sort((a, b) => {
    if (order[a.severity] !== order[b.severity]) return order[a.severity] - order[b.severity];
    if (a.location.file !== b.location.file) return a.location.file < b.location.file ? -1 : 1;
    if (a.location.line !== b.location.line) return a.location.line - b.location.line;
    return (a.location.column ?? 0) - (b.location.column ?? 0);
  });

  parseErrors.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));

  return { findings, opportunitiesByAxis, findingsByAxis, parseErrors };
}
