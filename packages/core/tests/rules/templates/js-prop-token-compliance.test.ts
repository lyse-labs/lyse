// packages/core/tests/rules/templates/js-prop-token-compliance.test.ts
import { describe, it, expect } from 'vitest';
import { jsPropTokenComplianceTemplate } from '../../../src/rules/templates/js-prop-token-compliance.js';

describe('template: js-prop-token-compliance', () => {
  it('exposes name + description + config schema', () => {
    expect(jsPropTokenComplianceTemplate.name).toBe('js-prop-token-compliance');
    expect(jsPropTokenComplianceTemplate.description).toMatch(/JSX/);
    expect(jsPropTokenComplianceTemplate.configSchema).toBeDefined();
  });

  it('builds a Rule that flags sx={{ color: "blue" }}', async () => {
    const rule = jsPropTokenComplianceTemplate.build({
      ruleId: 'mui/sx-color-tokens',
      axis: 'tokens',
      severity: 'warning',
      config: {
        prop_name: 'sx',
        target_key: 'color',
        compliant_prefix: 'palette.',
        allowed_literals: ['transparent', 'currentColor'],
      },
    });
    expect(rule.id).toBe('mui/sx-color-tokens');
    expect(rule.axis).toBe('tokens');
    const result = await rule.evaluate(
      {
        repoRoot: '/tmp',
        tokens: null,
        componentsModule: null,
        componentInventory: [],
        storyIndex: null,
        excludePaths: [],
      },
      {
        ts: [{
          path: 'a.tsx',
          source: 'const X = <Button sx={{ color: "blue" }} />;',
          // simplified AST mock — actual integration in audit-pipeline test
          ast: { type: 'Program', body: [] },
        }],
        css: [],
        cssInJs: [],
      },
    );
    expect(result.findings.length).toBeGreaterThan(0);
  });
});
