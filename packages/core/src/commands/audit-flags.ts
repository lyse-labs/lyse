/**
 * Shared flags and error types for the audit pipeline.
 *
 * Extracted from audit-pipeline.ts into its own module to break the circular
 * import that would otherwise occur between audit-pipeline.ts and
 * llm/layer4-stage.ts (both would need to reference these types).
 *
 * audit-pipeline.ts re-exports everything from here for backward compatibility.
 */

import type { Spinner } from "../util/spinner.js";

/**
 * Thrown when no LLM connector is configured and --static-only is not set.
 * The CLI layer catches this error and exits with code 1.
 */
export class RefuseToRunError extends Error {
  override name = "RefuseToRunError";
}

/**
 * CLI-level flags that override config-file values for a single audit run.
 * All fields are optional; omitting a field means "use the config/env value".
 */
export interface AuditFlags {
  /** Skip Layer 4 LLM augmentation; report Layers 1+2 score only (~30% coverage). */
  staticOnly?: boolean;
  /** Override the LLM cost cap for this run (USD). */
  costCapUsd?: number;
  /** If true, bypass the cache and force a fresh LLM call. */
  noCache?: boolean;
  /** Override the LLM provider (e.g. "anthropic" | "openai" | "ollama"). */
  llmProvider?: string;
  /** Override the LLM model identifier. */
  llmModel?: string;
  /**
   * When set, only this single dimension is audited by the LLM (focused mode).
   * ~9x cost reduction by sending only that dimension's prompt section.
   * Valid values: tokens | components | a11y | stories | themes | motion | patterns | naming | documentation
   */
  llmDimension?: string;
  /**
   * Optional progress reporter. When provided, the pipeline calls
   * `update()` at phase boundaries (file discovery, parsing, loading, rules,
   * scoring). Issuing `start()` / `succeed()` / `fail()` is the CLI's job —
   * the pipeline never owns the outcome label.
   *
   * Pass `undefined` (or a no-op spinner) from non-interactive callers
   * (fix.ts, MCP, share) to keep stderr quiet.
   */
  progress?: Spinner;
}
