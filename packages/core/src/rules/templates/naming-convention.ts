// packages/core/src/rules/templates/naming-convention.ts
import { z } from 'zod';
import type { Rule, Finding, RuleEvalResult, Severity } from '../../types.js';
import type { RuleTemplate } from './types.js';
import { basename } from 'node:path';

const ConfigSchema = z.object({
  target: z.enum(['file', 'export']),
  pattern: z.string(),
  exceptions: z.array(z.string()).default([]),
});
type Config = z.infer<typeof ConfigSchema>;

export const namingConventionTemplate: RuleTemplate<Config> = {
  name: 'naming-convention',
  description: 'Flags file names or exported symbols that do not match a regex pattern.',
  configSchema: ConfigSchema,
  build({ ruleId, axis, severity, config }) {
    const cfg = ConfigSchema.parse(config);
    const id = ruleId;
    // 'off' is not a runtime severity; fall back to 'info' if provided.
    const sev: Severity = (severity === 'off' ? 'info' : severity) as Severity;
    const re = new RegExp(cfg.pattern);
    const exceptionSet = new Set(cfg.exceptions);
    const rule: Rule = {
      id,
      axis,
      async evaluate(_ctx, parsed): Promise<RuleEvalResult> {
        const findings: Finding[] = [];
        let opportunities = 0;
        if (cfg.target === 'file') {
          for (const file of parsed.ts) {
            const name = basename(file.path);
            if (!name.endsWith('.tsx')) continue;
            opportunities++;
            if (exceptionSet.has(name)) continue;
            if (re.test(name)) continue;
            findings.push({
              ruleId: id,
              axis,
              severity: sev,
              location: { file: file.path, line: 1, column: 1 },
              message: `File "${name}" does not match naming pattern ${cfg.pattern}`,
            });
          }
        } else {
          // target === 'export'
          const exportRe = /export\s+(?:const|function|class)\s+(\w+)/g;
          for (const file of parsed.ts) {
            exportRe.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = exportRe.exec(file.source)) !== null) {
              opportunities++;
              const name = m[1]!;
              if (exceptionSet.has(name)) continue;
              if (re.test(name)) continue;
              const before = file.source.slice(0, m.index);
              const line = before.split('\n').length;
              findings.push({
                ruleId: id,
                axis,
                severity: sev,
                location: { file: file.path, line, column: 1 },
                message: `Export "${name}" does not match naming pattern ${cfg.pattern}`,
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
