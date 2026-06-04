/**
 * Adapter from the legacy CodemodResult shape (codemods/index.ts) to the
 * new Rule.applyCodemod return shape (types.ts).
 *
 * Legacy shape:  { patch, confidence (0-1), alternatives, rationale, rule_id, schema_version }
 * New shape:     { diff, importsAdded, confidence ("high"|"medium"|"low"), warnings? }
 *
 * This module is import-only — no runtime side effects.
 */

import type { CodemodResult as NewCodemodResult, Confidence } from "../types.js";
import type { CodemodResult as OldCodemodResult } from "../codemods/index.js";

/**
 * Convert a numeric confidence (0–1) to the Confidence union.
 * >0.8 → "high", >0.5 → "medium", else → "low"
 */
function toConfidence(numeric: number): Confidence {
  if (numeric >= 0.8) return "high";
  if (numeric > 0.5) return "medium";
  return "low";
}

/**
 * Extract import statements added by a patch.
 * Looks for lines that start with `+import ` (unified diff add lines).
 * Returns the import statement text (without the leading `+`).
 */
function extractImportsFromPatch(patch: string): string[] {
  if (!patch) return [];
  return patch
    .split("\n")
    .filter((line) => /^\+import\s/.test(line))
    .map((line) => line.slice(1).trim()); // strip leading '+'
}

/**
 * Adapt an OldCodemodResult to the NewCodemodResult shape expected by
 * Rule.applyCodemod consumers (e.g. the fix orchestrator in Task 12).
 */
export function adaptOldCodemodResult(old: OldCodemodResult): NewCodemodResult {
  const diff = old.patch ?? "";
  const importsAdded = extractImportsFromPatch(diff);
  const confidence = toConfidence(old.confidence);

  // Populate warnings when the rationale signals uncertainty or missing data.
  // A null rationale on a successful patch means no warning needed.
  if (old.rationale !== null) {
    return { diff, importsAdded, confidence, warnings: [old.rationale] };
  }

  return { diff, importsAdded, confidence };
}
