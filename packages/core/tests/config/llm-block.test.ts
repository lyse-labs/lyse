// packages/core/tests/config/llm-block.test.ts
import { describe, it, expect } from 'vitest';
import { safeParseLyseConfig } from '../../src/config/schema.js';

describe('llm config block in LyseConfigSchema', () => {
  it('accepts a full llm block with provider, model, and endpoint', () => {
    const r = safeParseLyseConfig({
      llm: { provider: 'anthropic', model: 'claude-sonnet-4-5', endpoint: 'https://api.example.com' },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.llm?.provider).toBe('anthropic');
      expect(r.value.llm?.model).toBe('claude-sonnet-4-5');
      expect(r.value.llm?.endpoint).toBe('https://api.example.com');
    }
  });

  it('accepts llm block with only provider', () => {
    const r = safeParseLyseConfig({ llm: { provider: 'openai' } });
    expect(r.ok).toBe(true);
  });

  it('accepts llm block with provider: none', () => {
    const r = safeParseLyseConfig({ llm: { provider: 'none' } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.llm?.provider).toBe('none');
    }
  });

  it('accepts llm block with provider: auto', () => {
    const r = safeParseLyseConfig({ llm: { provider: 'auto' } });
    expect(r.ok).toBe(true);
  });

  it('rejects an invalid provider value', () => {
    const r = safeParseLyseConfig({ llm: { provider: 'gemini' } });
    expect(r.ok).toBe(false);
  });

  it('accepts config with no llm block (optional)', () => {
    const r = safeParseLyseConfig({ designSystem: { componentsModule: '@ds/ui' } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.llm).toBeUndefined();
    }
  });
});
