import type { AuditResult, AxisName } from "../types.js";

const AXIS_TO_EXTRACTOR: Partial<Record<AxisName, "tokens" | "components" | "stories">> = {
  tokens: "tokens",
  components: "components",
  stories: "stories",
};

// Axes that measure CONSUMER adoption of the DS — meaningless on a self-DS audit.
const CONSUMER_ADOPTION_AXES: ReadonlySet<AxisName> = new Set(["tokens", "components"]);

export function buildDegradationLines(result: AuditResult): string[] {
  const lines: string[] = [];
  const extraction = result.meta?.extraction;
  const byExtractor = new Map((extraction?.entries ?? []).map((e) => [e.extractor, e]));
  const dsSelfMode = result.meta?.dsSelfMode === true;

  for (const a of result.axes) {
    const extractor = AXIS_TO_EXTRACTOR[a.axis];
    const entry = extractor ? byExtractor.get(extractor) : undefined;

    if (a.score === "N/A") {
      if (entry?.remediation) lines.push(`${a.axis}: ${entry.remediation}`);
      else lines.push(`${a.axis}: not scored — no ${a.axis} opportunities in scope.`);
      continue;
    }

    // Numeric score, but extraction was degraded/failed → the number may be unreliable.
    if (entry && (entry.status === "degraded" || entry.status === "failed")) {
      const hint = entry.remediation ? ` ${entry.remediation}` : "";
      lines.push(`${a.axis}: score may be unreliable — extraction ${entry.status}.${hint}`);
      continue;
    }

    // Numeric score on a self-DS audit for a consumer-adoption axis → the number
    // reflects the DS's own source, not consumer usage.
    if (dsSelfMode && CONSUMER_ADOPTION_AXES.has(a.axis)) {
      lines.push(`${a.axis}: self-DS audit — reflects the design system's own source, not consumer adoption.`);
    }
  }

  for (const c of extraction?.conflicts ?? []) {
    lines.push(`token conflict: ${c.value} defined by ${c.sources.join(" + ")} (${c.axis}).`);
  }

  return lines;
}
