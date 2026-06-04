// packages/core/tests/rules/pack-loader.test.ts
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadGeneratedPack } from '../../src/rules/pack-loader.js';

function makePackDir(yaml: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'lyse-pack-'));
  const lyseDir = join(dir, '.lyse');
  require('node:fs').mkdirSync(lyseDir, { recursive: true });
  writeFileSync(join(lyseDir, 'generated-rules.yaml'), yaml);
  return dir;
}

describe('loadGeneratedPack', () => {
  it('returns [] when .lyse/generated-rules.yaml does not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lyse-empty-'));
    const result = loadGeneratedPack(dir);
    expect(result.rules).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('loads a valid pack and instantiates rules from templates', () => {
    const dir = makePackDir(`
version: 1
generated_at: '2026-05-20T00:00:00Z'
generated_by: claude-sonnet-4-5
generated_from:
  lyse_version: '0.1.0'
  template_catalog_version: 1
  deps_hash: 'sha256:a'
  files_hash: 'sha256:b'
rules:
  - id: 'mui/sx-color-tokens'
    template: 'js-prop-token-compliance'
    axis: tokens
    severity: warning
    config:
      prop_name: sx
      target_key: color
      compliant_prefix: 'palette.'
      allowed_literals: ['transparent']
`);
    const result = loadGeneratedPack(dir);
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0]!.id).toBe('mui/sx-color-tokens');
  });

  it('skips unknown template names with a warning', () => {
    const dir = makePackDir(`
version: 1
generated_at: '2026-05-20T00:00:00Z'
generated_by: claude
generated_from:
  lyse_version: '0.1.0'
  template_catalog_version: 1
  deps_hash: 'sha256:a'
  files_hash: 'sha256:b'
rules:
  - id: 'r1'
    template: 'unknown-template'
    axis: tokens
    severity: warning
    config: {}
`);
    const result = loadGeneratedPack(dir);
    expect(result.rules).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes('unknown-template'))).toBe(true);
  });

  it('returns 0 rules when all rules have severity: off', () => {
    const dir = makePackDir(`
version: 1
generated_at: '2026-05-20T00:00:00Z'
generated_by: claude-sonnet-4-5
generated_from:
  lyse_version: '0.1.0'
  template_catalog_version: 1
  deps_hash: 'sha256:a'
  files_hash: 'sha256:b'
rules:
  - id: 'mui/sx-color-tokens'
    template: 'js-prop-token-compliance'
    axis: tokens
    severity: off
    config:
      prop_name: sx
      target_key: color
      compliant_prefix: 'palette.'
      allowed_literals: ['transparent']
  - id: 'mui/sx-spacing-tokens'
    template: 'js-prop-token-compliance'
    axis: tokens
    severity: off
    config:
      prop_name: sx
      target_key: padding
      compliant_prefix: 'spacing.'
      allowed_literals: []
`);
    const result = loadGeneratedPack(dir);
    expect(result.rules).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('skips a rule whose id collides with a built-in rule and emits a warning', () => {
    const dir = makePackDir(`
version: 1
generated_at: '2026-05-20T00:00:00Z'
generated_by: claude-sonnet-4-5
generated_from:
  lyse_version: '0.1.0'
  template_catalog_version: 1
  deps_hash: 'sha256:a'
  files_hash: 'sha256:b'
rules:
  - id: 'tokens/no-hardcoded-color'
    template: 'js-prop-token-compliance'
    axis: tokens
    severity: warning
    config:
      prop_name: sx
      target_key: color
      compliant_prefix: 'palette.'
      allowed_literals: []
`);
    const result = loadGeneratedPack(dir);
    expect(result.rules).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes('collides with a built-in rule'))).toBe(true);
  });

  it('skips only severity: off rules, keeps others', () => {
    const dir = makePackDir(`
version: 1
generated_at: '2026-05-20T00:00:00Z'
generated_by: claude-sonnet-4-5
generated_from:
  lyse_version: '0.1.0'
  template_catalog_version: 1
  deps_hash: 'sha256:a'
  files_hash: 'sha256:b'
rules:
  - id: 'mui/sx-color-off'
    template: 'js-prop-token-compliance'
    axis: tokens
    severity: off
    config:
      prop_name: sx
      target_key: color
      compliant_prefix: 'palette.'
      allowed_literals: []
  - id: 'mui/sx-spacing-warn'
    template: 'js-prop-token-compliance'
    axis: tokens
    severity: warning
    config:
      prop_name: sx
      target_key: padding
      compliant_prefix: 'spacing.'
      allowed_literals: []
`);
    const result = loadGeneratedPack(dir);
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0]!.id).toBe('mui/sx-spacing-warn');
  });
});
