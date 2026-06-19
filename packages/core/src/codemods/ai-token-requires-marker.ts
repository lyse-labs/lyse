import type { CodemodInput, CodemodResult } from "./index.js";
import { singleLineDiff } from "./diff.js";
import { reservedTokenRefOffsets } from "../parsers/ai-tokens.js";

const RULE_ID = "ai-governance/ai-token-requires-marker";
const DATA_AI_RE = /\bdata-ai(?:-[a-z][a-z0-9-]*)?\b/;
const OPEN_TAG_RE = /<([A-Za-z][A-Za-z0-9_.-]*)/g;

function noFix(rationale: string): CodemodResult {
  return { patch: null, confidence: 0, alternatives: [], rationale, rule_id: RULE_ID, schema_version: "1.0.0" };
}

/**
 * Scan `text` from `fromIndex` to find the real closing `>` of a JSX opening
 * tag, skipping `>` characters that are (a) part of `=>` or (b) inside `{...}`
 * attribute expressions. Returns the index of the real `>`, or -1 if not found.
 */
function findRealTagClose(text: string, fromIndex: number): number {
  let depth = 0;
  let quote: string | null = null; // current string delimiter, or null if not in string
  for (let i = fromIndex; i < text.length; i++) {
    const ch = text[i]!;
    if (quote !== null) {
      // Inside a string literal — only look for the matching closing quote (unescaped)
      if (ch === "\\" ) {
        i++; // skip escaped character
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      if (depth > 0) depth--;
    } else if (ch === ">" && depth === 0) {
      // Skip `=>` (arrow function)
      if (i > 0 && text[i - 1] === "=") continue;
      return i;
    }
  }
  return -1;
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
    const close = findRealTagClose(lineText, open);
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
