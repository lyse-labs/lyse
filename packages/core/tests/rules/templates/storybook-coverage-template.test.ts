// packages/core/tests/rules/templates/storybook-coverage-template.test.ts
import { describe, it, expect } from 'vitest';
import { storybookCoverageTemplate as T } from '../../../src/rules/templates/storybook-coverage-template.js';

describe('template: storybook-coverage-template', () => {
  it('flags Button.tsx when Button.stories.tsx is missing', async () => {
    const rule = T.build({
      ruleId: 'stories/coverage-custom',
      axis: 'stories',
      severity: 'info',
      config: { component_glob: 'src/components/*.tsx', story_glob_template: '{stem}.stories.tsx' },
    });
    const result = await rule.evaluate(
      { repoRoot: '/tmp', tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] },
      { ts: [
        { path: 'src/components/Button.tsx', source: '', ast: {} as never },
        { path: 'src/components/Card.tsx', source: '', ast: {} as never },
        { path: 'src/components/Card.stories.tsx', source: '', ast: {} as never },
      ], css: [], cssInJs: [] },
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.location.file).toBe('src/components/Button.tsx');
  });
});
