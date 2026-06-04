// packages/core/src/rules/templates/types.ts
import type { Rule } from '../../types.js';

export interface RuleTemplate<TConfig = Record<string, unknown>> {
  /** Template name as referenced in `.lyse/generated-rules.yaml`. */
  readonly name: string;
  /** One-line description shown to the LLM in the catalog. */
  readonly description: string;
  /** Zod schema (as a function returning z.ZodTypeAny). */
  readonly configSchema: unknown; // z.ZodTypeAny — typed loosely to avoid coupling here
  /** Build a runnable Rule from a config + a generated rule id + axis + severity. */
  build(args: {
    ruleId: string;
    axis: Rule['axis'];
    severity: 'error' | 'warning' | 'info' | 'off';
    config: TConfig;
  }): Rule;
}
