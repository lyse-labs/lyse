import type { AxisName } from "../../types.js";
import type { ExtractionReport } from "../../graph/types.js";

/**
 * An extractor feeds exactly one axis. `zones` feeds none — it partitions files
 * for every axis rather than supplying the evidence any single axis is scored on.
 */
const AXIS_BY_EXTRACTOR: Partial<Record<ExtractionReport["entries"][number]["extractor"], AxisName>> =
  {
    tokens: "tokens",
    components: "components",
    stories: "stories",
  };

/**
 * Axes whose evidence could not be extracted. A score computed over a surface
 * the tool failed to read is not a measurement of the design system — it is a
 * measurement of what the tool happened to see, and it must abstain instead.
 */
export function axesWithDegradedExtraction(extraction: ExtractionReport): Set<AxisName> {
  const out = new Set<AxisName>();
  for (const entry of extraction.entries) {
    if (entry.status === "ok") continue;
    const axis = AXIS_BY_EXTRACTOR[entry.extractor];
    if (axis !== undefined) out.add(axis);
  }
  return out;
}
