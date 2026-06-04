// packages/core/tests/rules/pack-validator.test.ts
import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { validatePack } from '../../src/rules/pack-validator.js';
import type { RulePack } from '../../src/rules/pack-loader.js';

const FIXTURE = resolve(__dirname, '../../fixtures/validation-fixture');

const validPack: RulePack = {
  version: 1,
  generated_at: '2026-05-20T00:00:00Z',
  generated_by: 'test',
  generated_from: { lyse_version: '0.1.0', template_catalog_version: 1, deps_hash: 'x', files_hash: 'y' },
  rules: [{
    id: 'css/color',
    template: 'css-property-token-compliance',
    axis: 'tokens',
    severity: 'warning',
    config: { property: 'color', compliant_pattern: 'var(--.+)', allowed_literals: [] },
  }, {
    id: 'tw/no-arbitrary',
    template: 'tailwind-utility-class-compliance',
    axis: 'tokens',
    severity: 'warning',
    config: { class_prefixes: ['bg', 'text'], allow_arbitrary_for: [] },
  }],
};

describe('validatePack', () => {
  it('passes a well-formed pack', async () => {
    const result = await validatePack(validPack, FIXTURE);
    expect(result.ok).toBe(true);
    expect(result.totalFindings).toBeGreaterThan(0);
  });

  it('fails when schema is invalid (missing rules)', async () => {
    const bad = { ...validPack, rules: undefined } as unknown as RulePack;
    const result = await validatePack(bad, FIXTURE);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/rules/);
  });

  it('fails when no rule fires any finding (smoke test fails)', async () => {
    const bad: RulePack = {
      ...validPack,
      rules: [{
        id: 'no-op',
        template: 'naming-convention',
        axis: 'components',
        severity: 'warning',
        config: { target: 'file', pattern: '.*', exceptions: [] }, // matches everything
      }],
    };
    const result = await validatePack(bad, FIXTURE);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /no findings/i.test(e))).toBe(true);
  });
});
