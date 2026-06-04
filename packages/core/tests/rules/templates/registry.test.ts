// packages/core/tests/rules/templates/registry.test.ts
import { describe, it, expect } from 'vitest';
import { getTemplate, listTemplates, templateCatalogDescriptions, TEMPLATE_CATALOG_VERSION } from '../../../src/rules/templates/registry.js';

describe('template registry', () => {
  it('lists exactly 8 templates', () => {
    expect(listTemplates()).toHaveLength(8);
  });

  it('catalog version is 1', () => {
    expect(TEMPLATE_CATALOG_VERSION).toBe(1);
  });

  it('all templates have unique names', () => {
    const names = listTemplates().map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('getTemplate returns the right one', () => {
    const t = getTemplate('js-prop-token-compliance');
    expect(t?.name).toBe('js-prop-token-compliance');
  });

  it('getTemplate returns undefined for unknown', () => {
    expect(getTemplate('does-not-exist')).toBeUndefined();
  });

  it('catalog descriptions include all 8 names', () => {
    const desc = templateCatalogDescriptions();
    for (const t of listTemplates()) {
      expect(desc).toContain(t.name);
    }
  });
});
