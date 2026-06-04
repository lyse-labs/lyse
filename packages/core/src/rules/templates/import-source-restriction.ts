// packages/core/src/rules/templates/import-source-restriction.ts
import { z } from 'zod';
import type { Rule, Finding, RuleEvalResult, Severity } from '../../types.js';
import type { RuleTemplate } from './types.js';

const ConfigSchema = z.object({
  target_components: z.array(z.string()),
  allowed_sources: z.array(z.string()).default([]),
  forbidden_sources: z.array(z.string()).default([]),
});
type Config = z.infer<typeof ConfigSchema>;

export const importSourceRestrictionTemplate: RuleTemplate<Config> = {
  name: 'import-source-restriction',
  description:
    'Flags imports of named components from sources other than the allowed list. Useful to enforce DS component imports from the canonical module.',
  configSchema: ConfigSchema,
  build({ ruleId, axis, severity, config }) {
    const cfg = ConfigSchema.parse(config);
    const id = ruleId;
    // 'off' is not a runtime severity; fall back to 'info' if provided.
    const sev: Severity = (severity === 'off' ? 'info' : severity) as Severity;
    const targetSet = new Set(cfg.target_components);
    const importRe = /import\s+(?:\{([^}]+)\}|(\w+))(?:\s*,\s*\{([^}]+)\})?\s+from\s+["']([^"']+)["']/g;
    const rule: Rule = {
      id,
      axis,
      async evaluate(_ctx, parsed): Promise<RuleEvalResult> {
        const findings: Finding[] = [];
        let opportunities = 0;
        for (const file of parsed.ts) {
          importRe.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = importRe.exec(file.source)) !== null) {
            const namedA = (m[1] ?? '').split(',').map((s) => s.trim().split(/\s+as\s+/)[0]!.trim()).filter(Boolean);
            const namedB = (m[3] ?? '').split(',').map((s) => s.trim().split(/\s+as\s+/)[0]!.trim()).filter(Boolean);
            const named = [...namedA, ...namedB];
            const source = m[4]!;
            for (const name of named) {
              if (!targetSet.has(name)) continue;
              opportunities++;
              const isAllowed = cfg.allowed_sources.length === 0 || cfg.allowed_sources.some((s) => source === s || source.startsWith(s + '/'));
              const isForbidden = cfg.forbidden_sources.some((s) => source === s || source.startsWith(s + '/'));
              if (isAllowed && !isForbidden) continue;
              const before = file.source.slice(0, m.index);
              const line = before.split('\n').length;
              const column = m.index - before.lastIndexOf('\n');
              findings.push({
                ruleId: id,
                axis,
                severity: sev,
                location: { file: file.path, line, column },
                message: `${name} imported from "${source}" — allowed: ${cfg.allowed_sources.join(', ') || 'any'}`,
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
