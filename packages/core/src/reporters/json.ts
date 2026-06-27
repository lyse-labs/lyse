import type { AuditResult } from "../types.js";
import { sortFindings } from "./finding-order.js";
import { sortKeysDeep } from "../json-sort-keys.js";

const SCHEMA_URL =
  "https://github.com/lyse-labs/lyse/raw/main/schemas/v1/lyse-result.json";

export interface JsonRenderOptions {
  includeTimestamp?: boolean;
}

export function renderJson(result: AuditResult, options: JsonRenderOptions = {}): string {
  // Clone deeply so the input isn't mutated.
  const cloned: AuditResult = JSON.parse(JSON.stringify(result));

  // Sort findings deterministically.
  cloned.findings = [...cloned.findings].sort(sortFindings);

  if (!options.includeTimestamp) {
    cloned.timestamp = "";
    if (cloned.meta) {
      delete cloned.meta.layer4;
      if (cloned.meta.coverage) {
        // durationMs is wallclock — non-deterministic. Strip in the default
        // (deterministic) JSON output. Available via --include-timestamps.
        delete (cloned.meta.coverage as { durationMs?: number }).durationMs;
      }
      if (Object.keys(cloned.meta).length === 0) {
        delete cloned.meta;
      }
    }
  }

  // Merge $schema as the first key (will land alphabetically anyway — `$` comes before letters).
  const withSchema = { $schema: SCHEMA_URL, ...cloned } as Record<string, unknown>;

  // Sort keys recursively, JSON.stringify with 2-space indent, add trailing newline.
  return JSON.stringify(sortKeysDeep(withSchema), null, 2) + "\n";
}
