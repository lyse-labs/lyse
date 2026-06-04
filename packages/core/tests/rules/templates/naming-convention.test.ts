// packages/core/tests/rules/templates/naming-convention.test.ts
import { describe, it, expect } from 'vitest';
import { namingConventionTemplate as T } from '../../../src/rules/templates/naming-convention.js';

describe('template: naming-convention', () => {
  it('flags file names not matching pattern (PascalCase.tsx required)', async () => {
    const rule = T.build({
      ruleId: 'naming/pascal-files',
      axis: 'components',
      severity: 'warning',
      config: { target: 'file', pattern: '^[A-Z][a-zA-Z0-9]*\\.tsx$', exceptions: [] },
    });
    const result = await rule.evaluate(
      { repoRoot: '/tmp', tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] },
      { ts: [
        { path: 'src/button.tsx', source: '', ast: {} as never },
        { path: 'src/Card.tsx', source: '', ast: {} as never },
      ], css: [], cssInJs: [] },
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.location.file).toBe('src/button.tsx');
  });
});
