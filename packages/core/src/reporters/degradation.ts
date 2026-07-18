import type { AuditResult, AxisName } from "../types.js";

const AXIS_TO_EXTRACTOR: Partial<Record<AxisName, "tokens" | "components" | "stories">> = {
  tokens: "tokens",
  components: "components",
  stories: "stories",
};

export function buildDegradationLines(result: AuditResult): string[] {
  const lines: string[] = [];
  const extraction = result.meta?.extraction;
  const byExtractor = new Map((extraction?.entries ?? []).map((e) => [e.extractor, e]));

  for (const a of result.axes) {
    if (a.score !== "N/A") continue;
    const extractor = AXIS_TO_EXTRACTOR[a.axis];
    const entry = extractor ? byExtractor.get(extractor) : undefined;
    if (entry?.remediation) lines.push(`${a.axis}: ${entry.remediation}`);
    else lines.push(`${a.axis}: not scored — no ${a.axis} opportunities in scope.`);
  }

  for (const c of extraction?.conflicts ?? []) {
    lines.push(`token conflict: ${c.value} defined by ${c.sources.join(" + ")} (${c.axis}).`);
  }

  return lines;
}
