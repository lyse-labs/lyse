import type { Severity } from "../types.js";

const REAL_SEVERITIES = new Set<Severity>(["error", "warning", "info"]);
const TAG = "@lyse-overrides";
// `tokens/no-hardcoded-color: error` inside a JSDoc comment line.
const ENTRY_RE = /^[ \t]*\*?[ \t]*([\w-]+(?:\/[\w-]+)+)[ \t]*:[ \t]*(error|warning|info|off)[ \t]*$/;
// A comment continuation line carrying no entry — bare (` *`) or a
// decorative separator (` * ----`) — tolerated between entries. A star is
// required: a fully blank line may sit outside the comment block, and
// skipping it could leak the scan into code. Prose (any word character)
// still ends the block.
const BLANK_CONTINUATION_RE = /^[ \t]*\*[ \t]*[-=_~#*·—]*[ \t]*$/;
// The text before the tag on its line must be comment punctuation only —
// a tag mentioned in code or prose (a string literal, a doc sentence)
// must never activate overrides.
const COMMENT_PREFIX_RE = /^[ \t/*]*$/;

export interface FileOverrides {
  /** Rule ids suppressed for this file (severity `off`). */
  off: Set<string>;
  /** Rule id → display severity override (a real level only). */
  severity: Map<string, Severity>;
}

const EMPTY: FileOverrides = { off: new Set(), severity: new Map() };

/**
 * Parses per-file `@lyse-overrides` JSDoc frontmatter:
 *
 * ```
 * /**
 *  * @lyse-overrides
 *  *   tokens/no-hardcoded-color: error
 *  *   stories/coverage: off
 *  *\/
 * ```
 *
 * Accepted shapes (#226 — each of these previously parsed to ZERO entries,
 * silently disabling the whole block):
 * - CRLF line endings.
 * - Blank comment continuation lines (` *`) between entries.
 * - An entry on the same line as the tag (`@lyse-overrides tokens/x: off`).
 * - Multiple `@lyse-overrides` blocks in one file (entries are merged:
 *   `off` unions; on a severity conflict the later block wins; `off` beats
 *   a severity override for the same rule at the pipeline).
 *
 * A block's entries stop at the end of the comment (`*\/`) or at the first
 * line that is neither an entry nor a blank/decorative continuation (` *`,
 * ` * ----`). A tag only opens a block when everything before it on the
 * line is comment punctuation — a tag quoted in code or prose is inert.
 */
export function parseFileOverrides(source: string): FileOverrides {
  if (!source.includes(TAG)) return EMPTY;

  const off = new Set<string>();
  const severity = new Map<string, Severity>();
  const readEntry = (line: string): boolean => {
    const m = ENTRY_RE.exec(line);
    if (!m) return false;
    const ruleId = m[1]!;
    const level = m[2]!;
    if (level === "off") off.add(ruleId);
    else if (REAL_SEVERITIES.has(level as Severity)) severity.set(ruleId, level as Severity);
    return true;
  };
  const beforeCloser = (line: string): { text: string; closes: boolean } => {
    const at = line.indexOf("*/");
    return at === -1 ? { text: line, closes: false } : { text: line.slice(0, at), closes: true };
  };

  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const tagAt = lines[i]!.indexOf(TAG);
    if (tagAt === -1) continue;
    if (!COMMENT_PREFIX_RE.test(lines[i]!.slice(0, tagAt))) continue;

    const sameLine = beforeCloser(lines[i]!.slice(tagAt + TAG.length));
    readEntry(sameLine.text);
    if (sameLine.closes) continue;

    for (let j = i + 1; j < lines.length; j++) {
      // A repeated tag line ends this block; the outer loop re-enters on it.
      if (lines[j]!.includes(TAG)) break;
      const { text, closes } = beforeCloser(lines[j]!);
      if (closes) {
        readEntry(text);
        break;
      }
      if (BLANK_CONTINUATION_RE.test(text)) continue;
      if (!readEntry(text)) break;
    }
  }

  if (off.size === 0 && severity.size === 0) return EMPTY;
  return { off, severity };
}
