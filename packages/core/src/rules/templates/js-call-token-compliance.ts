// packages/core/src/rules/templates/js-call-token-compliance.ts
import { z } from 'zod';
import type { Rule, Finding, Severity } from '../../types.js';
import type { RuleTemplate } from './types.js';

const ConfigSchema = z.object({
  call_pattern: z.string(),
  forbidden_alternative: z.string(),
  exceptions: z.array(z.string()).default([]),
});
type Config = z.infer<typeof ConfigSchema>;

const LITERAL_PX_RE = /['"]?\b(\d+(?:\.\d+)?)px\b['"]?/g;
const LITERAL_REM_RE = /['"]?\b(\d+(?:\.\d+)?)rem\b['"]?/g;

export const jsCallTokenComplianceTemplate: RuleTemplate<Config> = {
  name: 'js-call-token-compliance',
  description:
    'Flags raw px/rem literals in JS/TS files that should use a theme-call pattern (e.g. theme.spacing(2)).',
  configSchema: ConfigSchema,
  build({ ruleId, axis, severity, config }) {
    const cfg = ConfigSchema.parse(config);
    const id = ruleId;
    // 'off' is not a runtime severity; fall back to 'info' if provided.
    const sev: Severity = (severity === 'off' ? 'info' : severity) as Severity;
    const flagPx = /literal_px/.test(cfg.forbidden_alternative);
    const flagRem = /literal_rem/.test(cfg.forbidden_alternative);
    // Build checks array once at rule-construction time; not inside evaluate().
    const checks: Array<{ re: RegExp; unit: 'px' | 'rem' }> = [];
    if (flagPx) checks.push({ re: new RegExp(LITERAL_PX_RE, 'g'), unit: 'px' });
    if (flagRem) checks.push({ re: new RegExp(LITERAL_REM_RE, 'g'), unit: 'rem' });
    const rule: Rule = {
      id,
      axis,
      async evaluate(_ctx, parsed) {
        const findings: Finding[] = [];
        let opportunities = 0;
        for (const file of parsed.ts) {
          for (const { re, unit } of checks) {
            re.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = re.exec(file.source)) !== null) {
              opportunities++;
              const literal = `${m[1]}${unit}`;
              if (cfg.exceptions.includes(literal)) continue;
              const before = file.source.slice(0, m.index);
              const line = before.split('\n').length;
              const column = m.index - before.lastIndexOf('\n');
              findings.push({
                ruleId: id,
                axis,
                severity: sev,
                location: { file: file.path, line, column },
                message: `Hardcoded ${literal} should use ${cfg.call_pattern}(N)`,
              });
            }
          }
        }
        return { findings, opportunities };
      },
    };
    return rule;
  },
};
