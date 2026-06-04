// packages/core/src/rules/templates/js-prop-token-compliance.ts
import { z } from 'zod';
import type { Rule, Finding, RuleEvalResult, Severity } from '../../types.js';
import type { RuleTemplate } from './types.js';
import { escapeRegExp } from './_regex-utils.js';

const ConfigSchema = z.object({
  prop_name: z.string(),
  target_key: z.string(),
  compliant_prefix: z.string(),
  allowed_literals: z.array(z.string()).default([]),
});
type Config = z.infer<typeof ConfigSchema>;

export const jsPropTokenComplianceTemplate: RuleTemplate<Config> = {
  name: 'js-prop-token-compliance',
  description:
    'Flags JSX prop values (e.g. sx={{ color: "blue" }}) that are not token references. ' +
    'Compliant values must start with `compliant_prefix` or be in `allowed_literals`.',
  configSchema: ConfigSchema,
  build({ ruleId, axis, severity, config }) {
    const cfg = ConfigSchema.parse(config);
    const id = ruleId;
    // 'off' is not a runtime severity; fall back to 'info' if provided.
    const sev: Severity = (severity === 'off' ? 'info' : severity) as Severity;
    // Build regex once at rule-construction time; not inside evaluate().
    const propRe = new RegExp(
      String.raw`\b${escapeRegExp(cfg.prop_name)}\s*=\s*\{\{[^}]*\b${escapeRegExp(cfg.target_key)}\s*:\s*['"]([^'"]+)['"]`,
      'g',
    );
    const rule: Rule = {
      id,
      axis,
      async evaluate(_ctx, parsed): Promise<RuleEvalResult> {
        const findings: Finding[] = [];
        let opportunities = 0;
        for (const file of parsed.ts) {
          let m: RegExpExecArray | null;
          propRe.lastIndex = 0;
          while ((m = propRe.exec(file.source)) !== null) {
            opportunities++;
            const value = m[1]!;
            if (cfg.allowed_literals.includes(value)) continue;
            if (value.startsWith(cfg.compliant_prefix)) continue;
            const before = file.source.slice(0, m.index);
            const line = before.split('\n').length;
            const column = m.index - before.lastIndexOf('\n');
            findings.push({
              ruleId: id,
              axis,
              severity: sev,
              location: { file: file.path, line, column },
              message: `${cfg.prop_name}.${cfg.target_key} value "${value}" should use a token (prefix: ${cfg.compliant_prefix})`,
            });
          }
        }
        return { findings, opportunities };
      },
    };
    return rule;
  },
};

