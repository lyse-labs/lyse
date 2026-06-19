import type { CodemodInput, CodemodResult } from "./index.js";
import { singleLineDiff, insertAndReplaceDiff } from "./diff.js";

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

  const oldClosing = `</${nativeTag}>`;
  // Check if the closing tag is on the same line — affects confidence
  const closingOnSameLine = sourceLine.includes(oldClosing);
  const confidence = closingOnSameLine ? 0.85 : 0.5;

  // When the closing tag is on the same line, rewrite BOTH tags so the result
  // is valid JSX (`<Button>…</Button>`), not a mismatched `<Button>…</button>`.
  // We do this by substituting the whole source line. Otherwise rewrite only
  // the opening tag (self-closing `<input/>` needs no closing swap; a multi-line
  // element's closing tag is handled by the manual-verify rationale below).
  const oldFragment = closingOnSameLine ? sourceLine : `<${nativeTag}`;
  const newFragment = closingOnSameLine
    ? sourceLine.replace(`<${nativeTag}`, `<${dsName}`).replace(oldClosing, `</${dsName}>`)
    : `<${dsName}`;

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

  // One diff, one hunk: insert the import AND replace the tag together so the
  // line offsets stay consistent. Concatenating two independently-generated
  // diffs corrupts the patch (the second hunk's offsets are wrong once the
  // first changes the file length) and git apply rejects it.
  const chainedPatch = insertAndReplaceDiff(
    path,
    source,
    lastImportLine,
    `import { ${dsName} } from "${ctx.componentsModule}";`,
    finding.location.line,
    oldFragment,
    newFragment,
  );

  return {
    patch: chainedPatch,
    confidence: confidence - 0.1, // chained edits are slightly less safe
    alternatives: [],
    rationale: closingOnSameLine
      ? null
      : `Closing </${nativeTag}> is not on the same line; the diff replaces the opening tag only. Verify the closing tag manually.`,
    rule_id: ruleId,
    schema_version: "1.0.0",
  };
}
