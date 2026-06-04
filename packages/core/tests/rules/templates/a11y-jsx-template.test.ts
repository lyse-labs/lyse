// packages/core/tests/rules/templates/a11y-jsx-template.test.ts
import { describe, it, expect } from 'vitest';
import { a11yJsxTemplate as T } from '../../../src/rules/templates/a11y-jsx-template.js';

describe('template: a11y-jsx-template', () => {
  it('flags <img> without alt attribute', async () => {
    const rule = T.build({
      ruleId: 'a11y/img-alt',
      axis: 'a11y',
      severity: 'error',
      config: { jsx_a11y_rule_id: 'alt-text', options: {} },
    });
    const result = await rule.evaluate(
      { repoRoot: '/tmp', tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] },
      { ts: [{ path: 'a.tsx', source: '<img src="x.png" />', ast: {} as never }], css: [], cssInJs: [] },
    );
    expect(result.findings.length).toBeGreaterThan(0);
  });
});
