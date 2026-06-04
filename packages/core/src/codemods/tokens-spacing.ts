import type { CodemodInput, CodemodResult } from "./index.js";
import { singleLineDiff } from "./diff.js";

const SPACING_VALUE_RE = /(\d+(\.\d+)?)(px|rem|em)\b/;

export function fixHardcodedSpacing(input: CodemodInput): CodemodResult {
  const ruleId = "tokens/no-hardcoded-spacing";
  const { source, path, finding, ctx } = input;

  if (!ctx.tokens || ctx.tokens.spacing.size === 0) {
    return {
      patch: null,
      confidence: 0,
      alternatives: [],
      rationale: "No spacing tokens loaded — cannot suggest a replacement.",
      rule_id: ruleId,
      schema_version: "1.0.0",
    };
  }

  const sourceLines = source.split("\n");
  const sourceLine = sourceLines[finding.location.line - 1] ?? "";
  const match = sourceLine.match(SPACING_VALUE_RE);
  if (!match) {
    return {
      patch: null,
      confidence: 0,
      alternatives: [],
      rationale: `Could not extract a hardcoded spacing value from line ${finding.location.line}.`,
      rule_id: ruleId,
      schema_version: "1.0.0",
    };
  }

  const numericValue = match[1]!;
  const candidates = ctx.tokens.spacing.get(numericValue);
  if (!candidates || candidates.length === 0) {
    return {
      patch: null,
      confidence: 0,
      alternatives: [],
      rationale: `Value ${match[0]} is not in the spacing token scale.`,
      rule_id: ruleId,
      schema_version: "1.0.0",
    };
  }

  if (candidates.length > 1) {
    const alternatives = candidates.map((tokenName) => {
      const patch = singleLineDiff(
        path,
        source,
        finding.location.line,
        match[0],
        `var(--spacing-${tokenName})`,
      );
      return { patch, rationale: `Replace with token ${tokenName}` };
    });
    return {
      patch: null,
      confidence: 0,
      alternatives,
      rationale: `Value ${match[0]} maps to multiple tokens (${candidates.join(", ")}).`,
      rule_id: ruleId,
      schema_version: "1.0.0",
    };
  }

  const tokenName = candidates[0]!;
  const patch = singleLineDiff(
    path,
    source,
    finding.location.line,
    match[0],
    `var(--spacing-${tokenName})`,
  );
  return {
    patch,
    confidence: 0.95,
    alternatives: [],
    rationale: null,
    rule_id: ruleId,
    schema_version: "1.0.0",
  };
}
