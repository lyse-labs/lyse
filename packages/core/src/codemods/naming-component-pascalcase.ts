import type { CodemodInput, CodemodResult } from "./index.js";
import { singleLineDiff } from "./diff.js";

/**
 * Converts a name to PascalCase.
 * Examples: myComponent → MyComponent, my_component → MyComponent
 */
function toPascalCase(name: string): string {
  const parts = name
    .replace(/[-_]/g, " ")
    .replace(/([A-Z])/g, " $1")
    .trim()
    .split(/\s+/);
  return parts
    .map((p) => (p.length > 0 ? p[0]!.toUpperCase() + p.slice(1) : ""))
    .join("");
}

/**
 * Codemod for naming/component-pascalcase.
 *
 * Renames the exported component to PascalCase in the same file.
 * Cross-file renames are NOT attempted (returns confidence: 0 with rationale).
 *
 * Limitations documented:
 * - Only renames declarations where the name appears on the flagged line.
 * - Does NOT update other files that import this component.
 *   Use a project-level rename refactor (IDE or codemod tool) for that.
 */
export function fixNamingComponentPascalCase(input: CodemodInput): CodemodResult {
  const ruleId = "naming/component-pascalcase";
  const { source, path, finding } = input;

  // Extract old name from finding message: "Component 'myName' is not PascalCase"
  const nameMatch = finding.message.match(/Component '(\w+)'/);
  if (!nameMatch) {
    return {
      patch: null,
      confidence: 0,
      alternatives: [],
      rationale: "Could not parse component name from finding message.",
      rule_id: ruleId,
      schema_version: "1.0.0",
    };
  }

  const oldName = nameMatch[1]!;
  const newName = toPascalCase(oldName);

  if (oldName === newName) {
    return {
      patch: null,
      confidence: 0,
      alternatives: [],
      rationale: `Name '${oldName}' is already PascalCase or conversion produced no change.`,
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

  // Check if oldName is referenced elsewhere in the file (same-file references)
  const occurrences = (source.match(new RegExp(`\\b${oldName}\\b`, "g")) ?? []).length;
  // The declaration line itself counts as at least 1; if more → same-file references exist
  const hasSameFileRefs = occurrences > 1;
  // Check if exported name might be imported elsewhere (can't know for sure without cross-file analysis)
  // Conservative: if `export` keyword is present, assume cross-file risk → medium confidence
  const hasExport = sourceLine.includes("export");

  // Replace first occurrence on the declaration line only
  const newLine = sourceLine.replace(new RegExp(`\\b${oldName}\\b`), newName);

  const patch = singleLineDiff(path, source, finding.location.line, sourceLine, newLine);

  // Also try to replace same-file references in displayName assignments
  // e.g.: myComponent.displayName = "myComponent"
  const displayNameLine = sourceLines.findIndex((l) =>
    l.includes(`${oldName}.displayName`),
  );

  let combinedPatch = patch;
  const confidence = hasSameFileRefs || hasExport ? 0.6 : 0.9;
  const warnings: string[] = [];

  if (hasSameFileRefs) {
    warnings.push(
      `'${oldName}' appears ${occurrences} times in this file. Only the declaration line was renamed. ` +
        `Check other references manually.`,
    );
  }

  if (displayNameLine >= 0) {
    const dLine = sourceLines[displayNameLine] ?? "";
    const newDLine = dLine.replace(new RegExp(`\\b${oldName}\\b`, "g"), newName);
    combinedPatch += singleLineDiff(path, source, displayNameLine + 1, dLine, newDLine);
  }

  if (hasExport) {
    warnings.push(
      `This component is exported. Other files importing '${oldName}' will need manual updates.`,
    );
  }

  return {
    patch: combinedPatch,
    confidence,
    alternatives: [],
    rationale:
      warnings.length > 0
        ? warnings.join(" ")
        : null,
    rule_id: ruleId,
    schema_version: "1.0.0",
  };
}
