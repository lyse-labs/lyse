// packages/core/src/rules/templates/a11y-jsx-template.ts
import { z } from 'zod';
import type { Rule, Finding, RuleEvalResult, Severity } from '../../types.js';
import type { RuleTemplate } from './types.js';

const ConfigSchema = z.object({
  jsx_a11y_rule_id: z.string(),
  options: z.record(z.string(), z.unknown()).default({}),
});
type Config = z.infer<typeof ConfigSchema>;

// Minimal in-repo checks for the v0.1 catalog. The existing built-in
// a11y/essentials rule wraps the full eslint-plugin-jsx-a11y; this template
// provides simpler bespoke checks generated rules can compose.
const CHECKS: Record<string, (source: string) => Array<{ index: number; message: string }>> = {
  'alt-text': (src) => {
    const re = /<img\b((?:(?!alt=)[^>])*?)\/?>/g;
    const out: Array<{ index: number; message: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      out.push({ index: m.index, message: '<img> missing alt attribute' });
    }
    return out;
  },
  'label-has-associated-control': (src) => {
    const re = /<input\b[^>]*?\/?>(?![\s\S]*?<\/label>)/g;
    const out: Array<{ index: number; message: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      out.push({ index: m.index, message: '<input> without an associated label' });
    }
    return out;
  },
};

export const a11yJsxTemplate: RuleTemplate<Config> = {
  name: 'a11y-jsx-template',
  description: 'Per-rule a11y checks on JSX (alt-text, label-has-associated-control, etc.).',
  configSchema: ConfigSchema,
  build({ ruleId, axis, severity, config }) {
    const cfg = ConfigSchema.parse(config);
    const id = ruleId;
    // 'off' is not a runtime severity; fall back to 'info' if provided.
    const sev: Severity = (severity === 'off' ? 'info' : severity) as Severity;
    const check = CHECKS[cfg.jsx_a11y_rule_id];
    const rule: Rule = {
      id,
      axis,
      async evaluate(_ctx, parsed): Promise<RuleEvalResult> {
        if (!check) return { findings: [], opportunities: 0 };
        const findings: Finding[] = [];
        let opportunities = 0;
        for (const file of parsed.ts) {
          const hits = check(file.source);
          opportunities += hits.length;
          for (const hit of hits) {
            const before = file.source.slice(0, hit.index);
            const line = before.split('\n').length;
            findings.push({
              ruleId: id,
              axis,
              severity: sev,
              location: { file: file.path, line, column: 1 },
              message: hit.message,
            });
          }
        }
        return { findings, opportunities };
      },
    };
    return rule;
  },
};
