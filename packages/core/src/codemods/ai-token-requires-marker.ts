import type { CodemodInput, CodemodResult } from "./index.js";
import { singleLineDiff } from "./diff.js";
import { reservedTokenRefOffsets } from "../rules/ai-governance-ai-token-requires-marker.js";

const RULE_ID = "ai-governance/ai-token-requires-marker";
const DATA_AI_RE = /\bdata-ai(?:-[a-z][a-z0-9-]*)?\b/;
const OPEN_TAG_RE = /<([A-Za-z][A-Za-z0-9_.-]*)/g;

function noFix(rationale: string): CodemodResult {
  return { patch: null, confidence: 0, alternatives: [], rationale, rule_id: RULE_ID, schema_version: "1.0.0" };
}

/**
 * Locate the single-line JSX opening tag that encloses the reserved-token
 * reference at `refIndex`. Returns the 1-based line, the line text, and the
 * column just after the tag name (where ` data-ai` is inserted). Null when the
 * reference is not inside a single-line opening tag (the ambiguous/structural
 * cases we refuse).
 */
function findEnclosingOpeningTag(
  source: string,
  refIndex: number,
): { line: number; lineText: string; tagNameEnd: number } | null {
  const lineStart = source.lastIndexOf("\n", refIndex - 1) + 1;
  const lineEndRaw = source.indexOf("\n", refIndex);
  const lineEnd = lineEndRaw === -1 ? source.length : lineEndRaw;
  const lineText = source.slice(lineStart, lineEnd);
  const refCol = refIndex - lineStart;

  let best: { tagNameEnd: number; open: number } | null = null;
  OPEN_TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = OPEN_TAG_RE.exec(lineText)) !== null) {
    const open = m.index;
    if (open >= refCol) break;
    const close = lineText.indexOf(">", open);
    if (close === -1 || close < refCol) continue; // tag must enclose the ref on this line
    best = { tagNameEnd: open + m[0].length, open };
  }
  if (!best) return null;

  const line = source.slice(0, lineStart).split("\n").length;
  return { line, lineText, tagNameEnd: best.tagNameEnd };
}

export function fixWrapAiToken(input: CodemodInput): CodemodResult {
  const { source, path } = input;

  const offsets = reservedTokenRefOffsets(source);
  if (offsets.length === 0) return noFix("No reserved AI-token reference found.");
  if (offsets.length > 1) {
    return noFix("Multiple reserved AI-token references — ambiguous which element to annotate.");
  }

  const tag = findEnclosingOpeningTag(source, offsets[0]!);
  if (!tag) {
    return noFix("Reserved token is not inside a single-line JSX opening tag — manual annotation required.");
  }
  if (DATA_AI_RE.test(tag.lineText)) return noFix("Element already carries a data-ai attribute.");

  const newLine = `${tag.lineText.slice(0, tag.tagNameEnd)} data-ai${tag.lineText.slice(tag.tagNameEnd)}`;
  const patch = singleLineDiff(path, source, tag.line, tag.lineText, newLine);

  return { patch, confidence: 0.85, alternatives: [], rationale: null, rule_id: RULE_ID, schema_version: "1.0.0" };
}
