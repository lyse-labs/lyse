import type { CodemodInput, CodemodResult } from "./index.js";
import { singleLineDiff, prependLineDiff } from "./diff.js";

const NATIVE_TO_DS: Record<string, string> = {
  button: "Button",
  a: "Link",
  input: "Input",
  select: "Select",
  textarea: "Textarea",
};

export function fixShadowNative(input: CodemodInput): CodemodResult {
  const ruleId = "components/no-native-shadows";
  const { source, path, finding, ctx } = input;

  if (!ctx.componentsModule) {
    return {
      patch: null,
      confidence: 0,
      alternatives: [],
      rationale: "No componentsModule configured — cannot suggest a replacement.",
      rule_id: ruleId,
      schema_version: "1.0.0",
    };
  }

  // Extract native tag from finding message format:
  // "Native <button> used where <Button> from @acme/ui is available"
  const tagMatch = finding.message.match(/Native <(\w+)>/);
  if (!tagMatch) {
    return {
      patch: null,
      confidence: 0,
      alternatives: [],
      rationale: "Could not parse native tag from finding message.",
      rule_id: ruleId,
      schema_version: "1.0.0",
    };
  }

  const nativeTag = tagMatch[1]!.toLowerCase();
  const dsName = NATIVE_TO_DS[nativeTag];
  if (!dsName) {
    return {
      patch: null,
      confidence: 0,
      alternatives: [],
      rationale: `No DS equivalent mapped for <${nativeTag}>.`,
      rule_id: ruleId,
      schema_version: "1.0.0",
    };
  }

  const sourceLines = source.split("\n");
  const lineIdx = finding.location.line - 1;
  const sourceLine = sourceLines[lineIdx] ?? "";

  if (!sourceLine.includes(`<${nativeTag}`)) {
    return {
      patch: null,
      confidence: 0,
      alternatives: [],
      rationale: `Native <${nativeTag}> not found on line ${finding.location.line}.`,
      rule_id: ruleId,
      schema_version: "1.0.0",
    };
  }

  // Check if the DS component is already imported from componentsModule
  const importedAlready = source.split("\n").some((l) => {
    return (
      (l.includes(`from "${ctx.componentsModule}"`) ||
        l.includes(`from '${ctx.componentsModule}'`)) &&
      new RegExp(`\\b${dsName}\\b`).test(l)
    );
  });

  const oldFragment = `<${nativeTag}`;
  const newFragment = `<${dsName}`;
  const oldClosing = `</${nativeTag}>`;

  // Check if the closing tag is on the same line — affects confidence
  const closingOnSameLine = sourceLine.includes(oldClosing);
  const confidence = closingOnSameLine ? 0.85 : 0.5;

  const tagPatch = singleLineDiff(
    path,
    source,
    finding.location.line,
    oldFragment,
    newFragment,
  );

  if (importedAlready) {
    return {
      patch: tagPatch,
      confidence,
      alternatives: [],
      rationale: closingOnSameLine
        ? null
        : `Closing </${nativeTag}> is not on the same line; the diff replaces the opening tag only. Verify the closing tag manually.`,
      rule_id: ruleId,
      schema_version: "1.0.0",
    };
  }

  // Need to inject an import — find the line of the last import
  let lastImportLine = 0;
  for (let i = 0; i < sourceLines.length; i++) {
    if (/^import\s/.test(sourceLines[i] ?? "")) lastImportLine = i + 1;
  }

  const importPatch = prependLineDiff(
    path,
    source,
    `import { ${dsName} } from "${ctx.componentsModule}";`,
    lastImportLine,
  );

  return {
    patch: importPatch + tagPatch,
    confidence: confidence - 0.1, // chained patches are slightly less safe
    alternatives: [],
    rationale: closingOnSameLine
      ? null
      : `Closing </${nativeTag}> is not on the same line; the diff replaces the opening tag only. Verify the closing tag manually.`,
    rule_id: ruleId,
    schema_version: "1.0.0",
  };
}
