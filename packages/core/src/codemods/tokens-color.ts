import type { CodemodInput, CodemodResult } from "./index.js";
import { singleLineDiff } from "./diff.js";

const COLOR_VALUE_RE = /(#[0-9a-fA-F]{3,8}|rgb[a]?\([^)]+\)|hsl[a]?\([^)]+\)|oklch\([^)]+\))/;

export function fixHardcodedColor(input: CodemodInput): CodemodResult {
  const ruleId = "tokens/no-hardcoded-color";
  const { source, path, finding, ctx } = input;

  if (!ctx.tokens || ctx.tokens.colors.size === 0) {
    return {
      patch: null,
      confidence: 0,
      alternatives: [],
      rationale: "No tokens loaded — cannot suggest a replacement.",
      rule_id: ruleId,
      schema_version: "1.0.0",
    };
  }

  // Extract the hardcoded value from the finding's source line
  const sourceLines = source.split("\n");
  const sourceLine = sourceLines[finding.location.line - 1] ?? "";
  const match = sourceLine.match(COLOR_VALUE_RE);
  if (!match) {
    return {
      patch: null,
      confidence: 0,
      alternatives: [],
      rationale: `Could not extract a hardcoded color from line ${finding.location.line}.`,
      rule_id: ruleId,
      schema_version: "1.0.0",
    };
  }

  const value = match[0].toLowerCase();
  const candidates = ctx.tokens.colors.get(value);
  if (!candidates || candidates.length === 0) {
    return {
      patch: null,
      confidence: 0,
      alternatives: [],
      rationale: `Color value ${match[0]} is not in the project's token map. Add the token or remove the hardcoded value.`,
      rule_id: ruleId,
      schema_version: "1.0.0",
    };
  }

  if (candidates.length > 1) {
    // Multiple candidates: produce alternatives but no primary patch
    const alternatives = candidates.map((tokenName) => {
      const patch = singleLineDiff(
        path,
        source,
        finding.location.line,
        match[0],
        `var(--color-${tokenName})`,
      );
      return { patch, rationale: `Replace with token ${tokenName}` };
    });
    return {
      patch: null,
      confidence: 0,
      alternatives,
      rationale: `Color ${match[0]} maps to multiple tokens (${candidates.join(", ")}). Pick one explicitly.`,
      rule_id: ruleId,
      schema_version: "1.0.0",
    };
  }

  // Exactly one candidate
  const tokenName = candidates[0]!;
  const patch = singleLineDiff(
    path,
    source,
    finding.location.line,
    match[0],
    `var(--color-${tokenName})`,
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
