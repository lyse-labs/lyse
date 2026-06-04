// packages/core/tests/rules/templates/tailwind-utility-class-compliance.test.ts
import { describe, it, expect } from 'vitest';
import { tailwindUtilityClassComplianceTemplate as T } from '../../../src/rules/templates/tailwind-utility-class-compliance.js';

describe('template: tailwind-utility-class-compliance', () => {
  it('flags arbitrary-value classes like bg-[#1e293b]', async () => {
    const rule = T.build({
      ruleId: 'tw/no-arbitrary',
      axis: 'tokens',
      severity: 'warning',
      config: { class_prefixes: ['bg', 'text', 'p', 'm'], allow_arbitrary_for: [] },
    });
    const result = await rule.evaluate(
      { repoRoot: '/tmp', tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] },
      { ts: [{ path: 'a.tsx', source: '<div className="bg-[#1e293b] p-4" />', ast: {} as never }], css: [], cssInJs: [] },
    );
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0]!.message).toMatch(/bg-\[/);
  });

  it('does NOT flag bg-slate-900 (scale value)', async () => {
    const rule = T.build({
      ruleId: 'r',
      axis: 'tokens',
      severity: 'warning',
      config: { class_prefixes: ['bg'], allow_arbitrary_for: [] },
    });
    const result = await rule.evaluate(
      { repoRoot: '/tmp', tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] },
      { ts: [{ path: 'a.tsx', source: '<div className="bg-slate-900" />', ast: {} as never }], css: [], cssInJs: [] },
    );
    expect(result.findings).toHaveLength(0);
  });
});
