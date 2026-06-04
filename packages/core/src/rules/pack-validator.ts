// packages/core/src/rules/pack-validator.ts
import { z } from 'zod';
import type { RulePack } from './pack-loader.js';
import { walk } from '../walker.js';
import { parseTs } from '../parsers/ts.js';
import { parseCss } from '../parsers/css.js';
import { extractCssInJs } from '../parsers/css-in-js.js';
import type { ParsedFiles, RuleContext } from '../types.js';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { getTemplate } from './templates/registry.js';

const PackSchema = z.object({
  version: z.literal(1),
  generated_at: z.string(),
  generated_by: z.string(),
  generated_from: z.object({
    lyse_version: z.string(),
    template_catalog_version: z.number(),
    deps_hash: z.string(),
    files_hash: z.string(),
  }),
  rules: z.array(z.object({
    id: z.string().min(1),
    template: z.string().min(1),
    axis: z.enum(['tokens', 'a11y', 'components', 'stories']),
    severity: z.enum(['error', 'warning', 'info', 'off']),
    config: z.record(z.string(), z.unknown()),
    metadata: z.unknown().optional(),
  })),
});

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  totalFindings: number;
  durationMs: number;
}

export async function validatePack(pack: RulePack, fixtureRoot: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const t0 = Date.now();

  // 1. Schema
  const parsed = PackSchema.safeParse(pack);
  if (!parsed.success) {
    errors.push(`Schema invalid: ${parsed.error.errors.map((e) => `${e.path.join('.')} ${e.message}`).join('; ')}`);
    return { ok: false, errors, totalFindings: 0, durationMs: Date.now() - t0 };
  }

  // 2. Unique IDs + known templates
  const seen = new Set<string>();
  for (const r of parsed.data.rules) {
    if (seen.has(r.id)) errors.push(`Duplicate rule id: ${r.id}`);
    seen.add(r.id);
    if (!getTemplate(r.template)) errors.push(`Unknown template: ${r.template} (rule ${r.id})`);
  }
  if (errors.length > 0) {
    return { ok: false, errors, totalFindings: 0, durationMs: Date.now() - t0 };
  }

  // 3. Smoke test: build rules + run against fixture
  const files = await walk(fixtureRoot);
  const parsedFiles: ParsedFiles = { ts: [], css: [], cssInJs: [] };
  for (const path of files) {
    const source = readFileSync(path, 'utf8');
    const rel = relative(fixtureRoot, path);
    if (/\.(tsx?|jsx?)$/.test(path)) {
      parsedFiles.ts.push(await parseTs(rel, source));
      parsedFiles.cssInJs.push(...extractCssInJs(rel, source));
    } else if (/\.(s?css)$/.test(path)) {
      parsedFiles.css.push(await parseCss(rel, source));
    }
  }

  const ctx: RuleContext = {
    repoRoot: fixtureRoot,
    tokens: null,
    componentsModule: null,
    componentInventory: [],
    storyIndex: null,
    excludePaths: [],
  };

  let totalFindings = 0;
  for (const r of parsed.data.rules) {
    const template = getTemplate(r.template)!;
    let rule;
    try {
      rule = template.build({ ruleId: r.id, axis: r.axis, severity: r.severity, config: r.config });
    } catch (err) {
      errors.push(`Rule "${r.id}" failed to build: ${(err as Error).message}`);
      continue;
    }
    try {
      const result = await rule.evaluate(ctx, parsedFiles);
      totalFindings += result.findings.length;
    } catch (err) {
      errors.push(`Rule "${r.id}" crashed during smoke test: ${(err as Error).message}`);
    }
  }

  if (totalFindings === 0) {
    errors.push(`Pack produced no findings on the validation fixture (likely too permissive or broken)`);
  }

  const ok = errors.length === 0;
  return { ok, errors, totalFindings, durationMs: Date.now() - t0 };
}
