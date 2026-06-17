import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding } from "../types.js";
import { createLyseRule } from "./_rule-module.js";

const RULE_ID = "versioning/deprecation-markers";
const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;

/** A `@deprecated` JSDoc tag located in a block comment. */
export interface DeprecationMarker {
  /** 1-based line of the `@deprecated` tag. */
  line: number;
  /** 1-based column of the `@deprecated` tag. */
  column: number;
  /**
   * True when the tag carries machine-readable migration guidance: an inline
   * description, a wrapped (next-line) description, a sibling `@see` tag, or an
   * inline `{@link}`. Bare `@deprecated` tags (no guidance) are agent-hostile.
   */
  hasGuidance: boolean;
  /** True when the comment block carries the inline lyse-disable directive. */
  disabled: boolean;
}

const BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//g;
const LINK_RE = /\{@link\b/;
const DEPRECATED_TAG = "@deprecated";

/** Strips the JSDoc border (`/**`, `*`, `*\/`) from a single comment line. */
function stripBorder(line: string): string {
  return line
    .replace(/^[ \t]*\/\*\*?/, "")
    .replace(/^[ \t]*\*(?!\/)/, "")
    .replace(/\*\/[ \t]*$/, "")
    .trim();
}

/** True when `stripped` begins a JSDoc tag, e.g. `@see`, `@param`. */
function startsTag(stripped: string): boolean {
  return /^@\w/.test(stripped);
}

/** True when `stripped` is the `@deprecated` tag (at tag position). */
function isDeprecatedTag(stripped: string): boolean {
  return stripped === DEPRECATED_TAG || stripped.startsWith(`${DEPRECATED_TAG} `);
}

export function scanDeprecationMarkers(source: string): DeprecationMarker[] {
  const markers: DeprecationMarker[] = [];
  for (const blockMatch of source.matchAll(BLOCK_COMMENT_RE)) {
    const block = blockMatch[0];
    const blockStart = blockMatch.index ?? 0;
    const blockStartLine = source.slice(0, blockStart).split("\n").length;
    const disabled = block.includes(DISABLE_DIRECTIVE);
    const hasLink = LINK_RE.test(block);
    const rawLines = block.split("\n");
    const stripped = rawLines.map(stripBorder);
    // A `@see` sibling anywhere in the block counts as guidance for any tag.
    const hasSee = stripped.some((s) => /^@see\b\s*\S/.test(s));

    for (let i = 0; i < stripped.length; i++) {
      const s = stripped[i]!;
      if (!isDeprecatedTag(s)) continue;

      const inlineRest = s.slice(DEPRECATED_TAG.length).trim();
      let wrapped = false;
      for (let j = i + 1; j < stripped.length; j++) {
        const next = stripped[j]!;
        if (startsTag(next)) break;
        if (next.length > 0) {
          wrapped = true;
          break;
        }
      }
      const hasGuidance = inlineRest.length > 0 || wrapped || hasSee || hasLink;

      const rawLine = rawLines[i]!;
      const column = rawLine.indexOf(DEPRECATED_TAG) + 1;
      markers.push({ line: blockStartLine + i, column, hasGuidance, disabled });
    }
  }
  return markers;
}

const evaluate = async (_ctx: RuleContext, files: ParsedFiles): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  let opportunities = 0;

  for (const file of files.ts) {
    for (const marker of scanDeprecationMarkers(file.source)) {
      if (marker.disabled) continue;
      opportunities += 1;
      if (marker.hasGuidance) continue;
      findings.push({
        ruleId: RULE_ID,
        axis: "ai-surface",
        severity: "warning",
        location: { file: file.path, line: marker.line, column: marker.column },
        message:
          "Bare `@deprecated` tag with no migration guidance — a coding agent reading this symbol can't tell what to use instead",
        suggestion:
          "add a replacement pointer to the `@deprecated` tag, e.g. `@deprecated Use {@link NewButton} instead` or a `@see` sibling tag, so consumers and AI agents can migrate automatically",
      });
    }
  }

  return { findings, opportunities };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "ai-surface",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "`@deprecated` JSDoc tags should carry migration guidance",
    fullDescription:
      "Scans TypeScript/JavaScript JSDoc block comments for `@deprecated` tags and flags any that are bare — no inline description, no wrapped description, no `@see` sibling, and no inline `{@link}`. Counts every `@deprecated` tag as one opportunity; emits a warning per bare tag and nothing when guidance is present. Self-gating: a design system with no `@deprecated` tags records zero opportunities and is N/A (never penalized). Part of the AI-consumable contract (Face A): a coding agent that hits a deprecated symbol needs a machine-readable migration target, not a dead-end marker.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/versioning-deprecation-markers.md",
    rationale: `Why it matters

A bare \`@deprecated\` tag tells a consumer the symbol is going away but not what to use instead. A human can grep the changelog; a coding agent editing against the design system cannot reliably recover the migration target and will either keep the deprecated symbol or guess. A tag that carries a replacement pointer (inline description, \`@see\`, or \`{@link}\`) is machine-readable migration guidance.

The check is deliberately structural, not semantic: it only asks whether *some* guidance accompanies the tag, never whether the prose is correct. Detecting deprecation intent in free prose (without the structured tag) is irreducibly heuristic and is out of scope for this deterministic rule — it belongs to the LLM-graded layer. Because this is a pure structural check, synthetic precision equals real precision.`,
    examples: [
      {
        good: "/** @deprecated Use {@link NewButton} instead. */\nexport const OldButton = () => null;",
        bad: "/** @deprecated */\nexport const OldButton = () => null;",
      },
    ],
    allowlist: [
      "block comments containing `lyse-disable versioning/deprecation-markers` — that tag is skipped (and not counted as an opportunity)",
      "any `@deprecated` carrying an inline/wrapped description, a `@see` sibling, or an inline `{@link}` — treated as compliant",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
  singleFileCapable: true,
});

export const _internal = { scanDeprecationMarkers, DISABLE_DIRECTIVE };
