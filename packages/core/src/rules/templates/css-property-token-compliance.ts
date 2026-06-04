// packages/core/src/rules/templates/css-property-token-compliance.ts
import { z } from 'zod';
import type { Rule, Finding, RuleEvalResult, Severity } from '../../types.js';
import type { RuleTemplate } from './types.js';
import { escapeRegExp } from './_regex-utils.js';

const ConfigSchema = z.object({
  property: z.string(),
  compliant_pattern: z.string(),
  allowed_literals: z.array(z.string()).default([]),
});
type Config = z.infer<typeof ConfigSchema>;

export const cssPropertyTokenComplianceTemplate: RuleTemplate<Config> = {
  name: 'css-property-token-compliance',
  description:
    'Flags CSS declarations whose value is not a token reference. Compliant values match `compliant_pattern` or appear in `allowed_literals`.',
  configSchema: ConfigSchema,
  build({ ruleId, axis, severity, config }) {
    const cfg = ConfigSchema.parse(config);
    const id = ruleId;
    // 'off' is not a runtime severity; fall back to 'info' if provided.
    const sev: Severity = (severity === 'off' ? 'info' : severity) as Severity;
    // CSS values contain literal parentheses (e.g. var(--token)); escape them so
    // callers can write 'var(--.+)' as a readable pattern rather than 'var\\(--.+\\)'.
    const compliantRe = new RegExp(cfg.compliant_pattern.replace(/\(/g, '\\(').replace(/\)/g, '\\)'));
    const declRe = new RegExp(String.raw`\b${escapeRegExp(cfg.property)}\s*:\s*([^;}\n]+)`, 'g');
    const rule: Rule = {
      id,
      axis,
      async evaluate(_ctx, parsed): Promise<RuleEvalResult> {
        const findings: Finding[] = [];
        let opportunities = 0;
        for (const file of parsed.css) {
          declRe.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = declRe.exec(file.source)) !== null) {
            opportunities++;
            const value = m[1]!.trim();
            if (cfg.allowed_literals.includes(value)) continue;
            if (compliantRe.test(value)) continue;
            const before = file.source.slice(0, m.index);
            const line = before.split('\n').length;
            const column = m.index - before.lastIndexOf('\n');
            findings.push({
              ruleId: id,
              axis,
              severity: sev,
              location: { file: file.path, line, column },
              message: `${cfg.property}: "${value}" is not a token reference (expected ${cfg.compliant_pattern})`,
            });
          }
        }
        return { findings, opportunities };
      },
    };
    return rule;
  },
};

