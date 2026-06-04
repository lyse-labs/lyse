// packages/core/tests/commands/audit-pipeline-refresh-warning.test.ts
// Mock Layer 4 dependencies so this test focuses on static refresh warnings only.
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

describe('audit-pipeline: refresh warning', () => {
  it('prints warning when init-meta is >90 days old', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lyse-refresh-w-'));
    writeFileSync(join(dir, 'package.json'), '{"name":"a"}');
    mkdirSync(join(dir, '.lyse'));
    // package.json has no deps; hashDeps({}) → sha256:44136fa355b3678a
    const oldMeta = {
      generated_at_ms: Date.now() - 100 * 86_400_000,
      deps_hash: 'sha256:44136fa355b3678a',
      selected_deps: ['react'],
      lyse_version: '0.1.0',
    };
    writeFileSync(join(dir, '.lyse', 'init-meta.json'), JSON.stringify(oldMeta));
    const errors: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((c: string) => { errors.push(String(c)); return true; }) as never;
    try {
      await auditDirectory(dir);
    } finally {
      process.stderr.write = orig;
    }
    expect(errors.join('')).toMatch(/refresh/i);
    expect(errors.join('')).toMatch(/days/i);
  });

  it('prints warning when deps_hash changed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lyse-refresh-d-'));
    // Old hash stored, new deps in package.json → mismatch
    writeFileSync(join(dir, 'package.json'), '{"name":"a","dependencies":{"react":"18"}}');
    mkdirSync(join(dir, '.lyse'));
    writeFileSync(join(dir, '.lyse', 'init-meta.json'), JSON.stringify({
      generated_at_ms: Date.now(),
      deps_hash: 'sha256:OLDHASH',
      selected_deps: ['react'],
      lyse_version: '0.1.0',
    }));
    const errors: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((c: string) => { errors.push(String(c)); return true; }) as never;
    try {
      await auditDirectory(dir);
    } finally {
      process.stderr.write = orig;
    }
    expect(errors.join('')).toMatch(/dependency change/i);
  });
});
