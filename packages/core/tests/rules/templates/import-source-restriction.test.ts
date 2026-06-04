// packages/core/tests/rules/templates/import-source-restriction.test.ts
import { describe, it, expect } from 'vitest';
import { importSourceRestrictionTemplate as T } from '../../../src/rules/templates/import-source-restriction.js';

describe('template: import-source-restriction', () => {
  it('flags `import { Button } from "../local/Button"` when allowed_sources=["@ds/ui"]', async () => {
    const rule = T.build({
      ruleId: 'imports/button-from-ds',
      axis: 'components',
      severity: 'error',
      config: {
        target_components: ['Button'],
        allowed_sources: ['@ds/ui'],
        forbidden_sources: [],
      },
    });
    const result = await rule.evaluate(
      { repoRoot: '/tmp', tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] },
      { ts: [{ path: 'a.tsx', source: 'import { Button } from "../local/Button";', ast: {} as never }], css: [], cssInJs: [] },
    );
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it('does NOT flag import from allowed source', async () => {
    const rule = T.build({
      ruleId: 'r',
      axis: 'components',
      severity: 'error',
      config: {
        target_components: ['Button'],
        allowed_sources: ['@ds/ui'],
        forbidden_sources: [],
      },
    });
    const result = await rule.evaluate(
      { repoRoot: '/tmp', tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] },
      { ts: [{ path: 'a.tsx', source: 'import { Button } from "@ds/ui";', ast: {} as never }], css: [], cssInJs: [] },
    );
    expect(result.findings).toHaveLength(0);
  });
});
