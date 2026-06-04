// packages/core/tests/rules/templates/js-call-token-compliance.test.ts
import { describe, it, expect } from 'vitest';
import { jsCallTokenComplianceTemplate } from '../../../src/rules/templates/js-call-token-compliance.js';

describe('template: js-call-token-compliance', () => {
  it('flags raw px next to a theme call (margin: 16px instead of theme.spacing(2))', async () => {
    const rule = jsCallTokenComplianceTemplate.build({
      ruleId: 'mui/spacing-from-theme',
      axis: 'tokens',
      severity: 'warning',
      config: {
        call_pattern: 'theme.spacing',
        forbidden_alternative: 'literal_px|literal_rem',
        exceptions: ['0', '1px'],
      },
    });
    const result = await rule.evaluate(
      {
        repoRoot: '/tmp', tokens: null, componentsModule: null,
        componentInventory: [], storyIndex: null, excludePaths: [],
      },
      {
        ts: [{
          path: 'a.tsx',
          source: 'const x = { margin: "16px" };',
          ast: { type: 'Program', body: [] },
        }],
        css: [],
        cssInJs: [],
      },
    );
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it('does NOT flag literals in exceptions', async () => {
    const rule = jsCallTokenComplianceTemplate.build({
      ruleId: 'r1',
      axis: 'tokens',
      severity: 'warning',
      config: {
        call_pattern: 'theme.spacing',
        forbidden_alternative: 'literal_px|literal_rem',
        exceptions: ['0', '1px'],
      },
    });
    const result = await rule.evaluate(
      { repoRoot: '/tmp', tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] },
      { ts: [{ path: 'a.tsx', source: 'const x = "1px"', ast: {} as never }], css: [], cssInJs: [] },
    );
    expect(result.findings).toHaveLength(0);
  });
});
