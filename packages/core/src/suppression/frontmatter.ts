import type { Severity } from "../types.js";

const REAL_SEVERITIES = new Set<Severity>(["error", "warning", "info"]);
const TAG = "@lyse-overrides";
// `tokens/no-hardcoded-color: error` inside a JSDoc comment line.
const ENTRY_RE = /^[ \t]*\*?[ \t]*([\w-]+(?:\/[\w-]+)+)[ \t]*:[ \t]*(error|warning|info|off)[ \t]*$/;

export interface FileOverrides {
  /** Rule ids suppressed for this file (severity `off`). */
  off: Set<string>;
  /** Rule id → display severity override (a real level only). */
  severity: Map<string, Severity>;
}

const EMPTY: FileOverrides = { off: new Set(), severity: new Map() };

/**
 * Parses a per-file `@lyse-overrides` JSDoc frontmatter block:
 *
 * ```
 * /**
 *  * @lyse-overrides
 *  *   tokens/no-hardcoded-color: error
 *  *   stories/coverage: off
 *  *\/
 * ```
 *
 * Entries are read line-by-line starting after the `@lyse-overrides` tag and
 * stop at the first line that is not a `<rule-id>: <level>` entry. `off` goes
 * to {@link FileOverrides.off}; a real severity goes to the display map.
 */
export function parseFileOverrides(source: string): FileOverrides {
  const tagIdx = source.indexOf(TAG);
  if (tagIdx === -1) return EMPTY;

  const lines = source.split("\n");
  // Locate the line carrying the tag, then read subsequent entry lines.
  let i = 0;
  for (; i < lines.length; i++) {
    if (lines[i]!.includes(TAG)) break;
  }

  const off = new Set<string>();
  const severity = new Map<string, Severity>();
  for (let j = i + 1; j < lines.length; j++) {
    const m = ENTRY_RE.exec(lines[j]!);
    if (!m) break;
    const ruleId = m[1]!;
    const level = m[2]!;
    if (level === "off") off.add(ruleId);
    else if (REAL_SEVERITIES.has(level as Severity)) severity.set(ruleId, level as Severity);
  }

  if (off.size === 0 && severity.size === 0) return EMPTY;
  return { off, severity };
}
