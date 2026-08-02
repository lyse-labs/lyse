import type { ExtractionReport } from "../../graph/types.js";

/**
 * Rules whose verdict is derived from an extracted artefact. When the extractor
 * that feeds one of these degrades, the rule's answer is not evidence about the
 * repository — it is evidence about what the tool failed to read, and it must
 * not move the score.
 *
 * This is deliberately per-RULE, not per-axis. The dependency does not follow
 * the axis boundary: `components/svg-viewbox` and `a11y/icon-decorative-aria`
 * read source directly and are unaffected by an empty inventory, while
 * `tokens/no-hardcoded-color` and `stories/coverage` are not. Blanking a whole
 * axis silences rules whose evidence was read perfectly well.
 *
 * `coverage.test.ts` greps the rule sources and fails if a rule starts reading
 * an extracted artefact without being listed here, so this cannot silently rot.
 */
const RULES_BY_EXTRACTOR: Record<string, readonly string[]> = {
  components: [
    "components/no-style-escape-hatch",
    "components/no-native-shadows",
    "naming/hook-prefix",
    "naming/component-pascalcase",
    "stories/usage-examples",
    "stories/props-documented",
    "stories/coverage",
    "tokens/no-hardcoded-color",
    "tokens/no-hardcoded-spacing",
  ],
  tokens: ["tokens/no-hardcoded-color", "tokens/no-hardcoded-spacing"],
  stories: ["stories/coverage", "stories/usage-examples", "stories/props-documented"],
};

/** The source symbol each extractor exposes to rules, used by the drift test. */
export const EXTRACTOR_SYMBOLS: Record<string, string> = {
  components: "componentInventory",
};

/**
 * Rule ids that must be excluded from the score because the artefact they read
 * was not extracted. An axis left below its sample floor by this exclusion
 * abstains on its own — that is the honest outcome, and it keeps rules that read
 * source directly scoring normally.
 */
/**
 * Degraded extractors, grouped by the AXIS whose rules they actually blocked.
 *
 * The abstention reason is per-axis, and "the stories extractor did not
 * complete" is globally true but causally irrelevant to the tokens axis —
 * printing it there sends the user to fix the wrong thing. An extractor is
 * named for an axis only when it blocked a rule belonging to that axis, read
 * off the `axis/name` rule-id convention.
 */
export function blockedExtractorsByAxis(extraction: ExtractionReport): Map<string, string[]> {
  const byAxis = new Map<string, string[]>();
  for (const entry of extraction.entries) {
    if (entry.status === "ok") continue;
    for (const rule of RULES_BY_EXTRACTOR[entry.extractor] ?? []) {
      const axis = rule.split("/")[0];
      if (axis === undefined) continue;
      const list = byAxis.get(axis) ?? [];
      if (!list.includes(entry.extractor)) list.push(entry.extractor);
      byAxis.set(axis, list);
    }
  }
  return byAxis;
}

export function rulesBlockedByDegradedExtraction(extraction: ExtractionReport): Set<string> {
  const out = new Set<string>();
  for (const entry of extraction.entries) {
    if (entry.status === "ok") continue;
    for (const rule of RULES_BY_EXTRACTOR[entry.extractor] ?? []) out.add(rule);
  }
  return out;
}
