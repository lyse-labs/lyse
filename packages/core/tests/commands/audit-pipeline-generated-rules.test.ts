// packages/core/tests/commands/audit-pipeline-generated-rules.test.ts
// Mock Layer 4 dependencies so this test focuses on generated-rules loading only.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/llm/connectors/index.js', () => ({
  resolveConnector: vi.fn().mockResolvedValue({
    id: 'direct-api-key',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    hasMarginalCost: true,
    augmentFindings: () => Promise.resolve({ findings: [], tokensConsumed: { input: 0, output: 0 }, usdSpent: 0, modelUsed: 'mock', llmQuality: 'higher' }),
    estimateCost: () => ({ usd: 0, tokensIn: 0, tokensOut: 0 }),
    ping: () => Promise.resolve({ ok: true }),
  }),
}));
vi.mock('../../src/llm/augmenter.js', () => ({
  Layer4Augmenter: vi.fn().mockImplementation(function () { return ({
    run: vi.fn().mockResolvedValue({ findings: [], cacheHit: false, droppedHallucinations: 0, usdSpent: 0, modelUsed: 'mock', llmQuality: 'higher' }),
  }); }),
}));
vi.mock('../../src/llm/sampler.js', () => ({
  sampleForAudit: vi.fn().mockResolvedValue({ files: [], totalBytes: 0 }),
}));
vi.mock('../../src/util/git.js', () => ({
  gitHeadSha: vi.fn().mockResolvedValue('no-git'),
  modifiedFilesWithHashes: vi.fn().mockResolvedValue([]),
}));

import { auditDirectory } from '../../src/commands/audit-pipeline.js';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('audit-pipeline: loads generated pack alongside built-ins', () => {
  it('applies generated rule from .lyse/generated-rules.yaml', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lyse-pipeline-'));
    writeFileSync(join(dir, 'package.json'), '{"name":"a","dependencies":{"react":"18"}}');
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'A.tsx'), '<div className="bg-[#1e293b]" />');
    mkdirSync(join(dir, '.lyse'));
    writeFileSync(join(dir, '.lyse', 'generated-rules.yaml'), `
version: 1
generated_at: '2026-05-20T00:00:00Z'
generated_by: test
generated_from:
  lyse_version: '0.1.0'
  template_catalog_version: 1
  deps_hash: 'x'
  files_hash: 'y'
rules:
  - id: 'tw/no-arbitrary'
    template: 'tailwind-utility-class-compliance'
    axis: tokens
    severity: warning
    config: { class_prefixes: ['bg'], allow_arbitrary_for: [] }
`);
    const result = await auditDirectory(dir);
    const generatedFindings = result.result.findings.filter((f) => f.ruleId === 'tw/no-arbitrary');
    expect(generatedFindings.length).toBeGreaterThan(0);
  });
});
