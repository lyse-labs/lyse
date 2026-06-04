// packages/core/src/rules/templates/tailwind-utility-class-compliance.ts
import { z } from 'zod';
import type { Rule, Finding, RuleEvalResult, Severity } from '../../types.js';
import type { RuleTemplate } from './types.js';
import { escapeRegExp } from './_regex-utils.js';

const ConfigSchema = z.object({
  class_prefixes: z.array(z.string()),
  allow_arbitrary_for: z.array(z.string()).default([]),
});
type Config = z.infer<typeof ConfigSchema>;

export const tailwindUtilityClassComplianceTemplate: RuleTemplate<Config> = {
  name: 'tailwind-utility-class-compliance',
  description:
    'Flags Tailwind utility classes with arbitrary values (e.g. bg-[#1e293b]) for the specified prefixes. ' +
    'These bypass the configured scale.',
  configSchema: ConfigSchema,
  build({ ruleId, axis, severity, config }) {
    const cfg = ConfigSchema.parse(config);
    const id = ruleId;
    // 'off' is not a runtime severity; fall back to 'info' if provided.
    const sev: Severity = (severity === 'off' ? 'info' : severity) as Severity;
    const allowedSet = new Set(cfg.allow_arbitrary_for);
    const prefixGroup = cfg.class_prefixes.map(escapeRegExp).join('|');
    // Build regexes once at rule-construction time; not inside evaluate().
    // Regex to detect prefix-[value] patterns (e.g. bg-[#1e293b], text-[1rem])
    const arbitraryRe = new RegExp(`^(?:${prefixGroup})(?:-[a-z0-9]+)*-\\[`);
    // Regex to check if class starts with any watched prefix
    const prefixRe = new RegExp(`^(?:${prefixGroup})(?:-|$)`);
    // Match className="..." or className={`...`} — capture the value
    const classNameRe = /\bclassName\s*=\s*["'`]([^"'`]+)["'`]/g;
    const rule: Rule = {
      id,
      axis,
      async evaluate(_ctx, parsed): Promise<RuleEvalResult> {
        const findings: Finding[] = [];
        let opportunities = 0;
        for (const file of parsed.ts) {
          classNameRe.lastIndex = 0;
          let cm: RegExpExecArray | null;
          while ((cm = classNameRe.exec(file.source)) !== null) {
            const classes = cm[1]!.split(/\s+/);
            for (const cls of classes) {
              if (!prefixRe.test(cls)) continue;
              opportunities++;
              if (!cls.includes('[')) continue;
              // Check if this prefix is explicitly allowed for arbitrary values
              const prefix = cls.split('-')[0]!;
              if (allowedSet.has(prefix)) continue;
              if (!arbitraryRe.test(cls)) continue;
              const classIndex = cm.index + cm[0]!.indexOf(cls);
              const before = file.source.slice(0, classIndex);
              const line = before.split('\n').length;
              const column = classIndex - before.lastIndexOf('\n');
              findings.push({
                ruleId: id,
                axis,
                severity: sev,
                location: { file: file.path, line, column },
                message: `Arbitrary Tailwind value "${cls}" bypasses the configured scale`,
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

