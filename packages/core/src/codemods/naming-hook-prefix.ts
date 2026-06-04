import type { CodemodInput, CodemodResult } from "./index.js";
import { singleLineDiff } from "./diff.js";

/**
 * Convert a function name to a valid hook name.
 * Examples: getMyData → useMyData, fetchUser → useFetchUser
 */
function toHookName(name: string): string {
  const capitalized = name[0] ? name[0].toUpperCase() + name.slice(1) : name;
  return `use${capitalized}`;
}

/**
 * Codemod for naming/hook-prefix.
 *
 * Renames the exported hook function to use<PascalCase> in the same file.
 * Cross-file renames are NOT attempted — returns reduced confidence with a warning.
 *
 * Limitations documented:
 * - Only renames the declaration on the flagged line.
 * - Does NOT update other files that import this hook.
 *   Use a project-level rename refactor (IDE or codemod tool) for that.
 */
export function fixNamingHookPrefix(input: CodemodInput): CodemodResult {
  const ruleId = "naming/hook-prefix";
  const { source, path, finding } = input;

  // Extract old name from finding message: "Hook 'myHook' does not start with 'use' + uppercase letter"
  const nameMatch = finding.message.match(/Hook '(\w+)'/);
  if (!nameMatch) {
    return {
      patch: null,
      confidence: 0,
      alternatives: [],
      rationale: "Could not parse hook name from finding message.",
      rule_id: ruleId,
      schema_version: "1.0.0",
    };
  }

  const oldName = nameMatch[1]!;
  const newName = toHookName(oldName);

  if (oldName === newName) {
    return {
      patch: null,
      confidence: 0,
      alternatives: [],
      rationale: `Name '${oldName}' already has the correct hook prefix or conversion produced no change.`,
      rule_id: ruleId,
      schema_version: "1.0.0",
    };
  }

  const sourceLines = source.split("\n");
  const lineIdx = finding.location.line - 1;
  const sourceLine = sourceLines[lineIdx] ?? "";

  if (!sourceLine.includes(oldName)) {
    return {
      patch: null,
      confidence: 0,
      alternatives: [],
      rationale: `Name '${oldName}' not found on line ${finding.location.line}.`,
      rule_id: ruleId,
      schema_version: "1.0.0",
    };
  }

  // Count all occurrences in file
  const occurrences = (source.match(new RegExp(`\\b${oldName}\\b`, "g")) ?? []).length;
  const hasSameFileRefs = occurrences > 1;
  const hasExport = sourceLine.includes("export");

  // Replace on declaration line
  const newLine = sourceLine.replace(new RegExp(`\\b${oldName}\\b`), newName);
  const patch = singleLineDiff(path, source, finding.location.line, sourceLine, newLine);

  const confidence = hasSameFileRefs || hasExport ? 0.6 : 0.9;
  const warnings: string[] = [];

  if (hasSameFileRefs) {
    warnings.push(
      `'${oldName}' appears ${occurrences} times in this file. Only the declaration line was renamed. ` +
        `Check other references manually.`,
    );
  }

  if (hasExport) {
    warnings.push(
      `This hook is exported. Other files importing '${oldName}' will need manual updates.`,
    );
  }

  return {
    patch,
    confidence,
    alternatives: [],
    rationale: warnings.length > 0 ? warnings.join(" ") : null,
    rule_id: ruleId,
    schema_version: "1.0.0",
  };
}
