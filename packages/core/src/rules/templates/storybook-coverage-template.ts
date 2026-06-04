// packages/core/src/rules/templates/storybook-coverage-template.ts
import { z } from 'zod';
import type { Rule, Finding, RuleEvalResult, Severity } from '../../types.js';
import type { RuleTemplate } from './types.js';
import { basename, dirname } from 'node:path';

const ConfigSchema = z.object({
  component_glob: z.string(),
  story_glob_template: z.string(), // e.g., "{stem}.stories.tsx"
});
type Config = z.infer<typeof ConfigSchema>;

export const storybookCoverageTemplate: RuleTemplate<Config> = {
  name: 'storybook-coverage-template',
  description: 'Flags components without a corresponding stories file based on a path template.',
  configSchema: ConfigSchema,
  build({ ruleId, axis, severity, config }) {
    const cfg = ConfigSchema.parse(config);
    const id = ruleId;
    // 'off' is not a runtime severity; fall back to 'info' if provided.
    const sev: Severity = (severity === 'off' ? 'info' : severity) as Severity;
    const componentRe = globToRegExp(cfg.component_glob);
    const isStoryFile = (p: string) => /\.stories\.(tsx?|jsx?)$/.test(p);
    const rule: Rule = {
      id,
      axis,
      async evaluate(_ctx, parsed): Promise<RuleEvalResult> {
        const allPaths = new Set(parsed.ts.map((f) => f.path));
        const findings: Finding[] = [];
        let opportunities = 0;
        for (const file of parsed.ts) {
          if (!componentRe.test(file.path)) continue;
          if (isStoryFile(file.path)) continue;
          opportunities++;
          const name = basename(file.path);
          const stem = name.replace(/\.tsx?$/, '');
          const expectedStory = dirname(file.path) + '/' + cfg.story_glob_template.replace('{stem}', stem);
          if (allPaths.has(expectedStory)) continue;
          findings.push({
            ruleId: id,
            axis,
            severity: sev,
            location: { file: file.path, line: 1, column: 1 },
            message: `Missing story file: expected ${expectedStory}`,
          });
        }
        return { findings, opportunities };
      },
    };
    return rule;
  },
};

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '.+')
    .replace(/\*/g, '[^/]+');
  return new RegExp('^' + escaped + '$');
}
