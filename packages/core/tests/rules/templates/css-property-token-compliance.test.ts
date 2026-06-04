// packages/core/tests/rules/templates/css-property-token-compliance.test.ts
import { describe, it, expect } from 'vitest';
import { cssPropertyTokenComplianceTemplate as T } from '../../../src/rules/templates/css-property-token-compliance.js';

describe('template: css-property-token-compliance', () => {
  it('flags `color: #fff` when compliant_pattern requires var(--*)', async () => {
    const rule = T.build({
      ruleId: 'css/color-tokens',
      axis: 'tokens',
      severity: 'warning',
      config: { property: 'color', compliant_pattern: 'var(--.+)', allowed_literals: ['transparent'] },
    });
    const result = await rule.evaluate(
      { repoRoot: '/tmp', tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] },
      { ts: [], css: [{ path: 'a.css', source: 'a { color: #fff }', ast: {} as never }], cssInJs: [] },
    );
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it('does NOT flag `color: var(--accent)` (matches compliant_pattern)', async () => {
    const rule = T.build({
      ruleId: 'r',
      axis: 'tokens',
      severity: 'warning',
      config: { property: 'color', compliant_pattern: 'var(--.+)', allowed_literals: [] },
    });
    const result = await rule.evaluate(
      { repoRoot: '/tmp', tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] },
      { ts: [], css: [{ path: 'a.css', source: 'a { color: var(--accent) }', ast: {} as never }], cssInJs: [] },
    );
    expect(result.findings).toHaveLength(0);
  });
});
